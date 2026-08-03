import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recommend, type AssessmentInput } from "@/lib/commerce/recommendation";

const InputSchema = z.object({
  rsid: z.string().max(64).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  answers: z.object({
    primary_goal: z.enum(["cut", "recomp", "bulk", "longevity"]),
    experience: z.enum(["beginner", "intermediate", "advanced"]),
    equipment: z.enum(["none", "home_basic", "home_full", "gym"]),
    nutrition: z.enum(["omnivore", "pescatarian", "vegetarian", "halal"]),
    time_availability: z.enum(["lt3", "three_four", "five_plus"]),
    budget: z.enum(["lean", "committed", "apex"]),
    mobility: z.enum(["none", "knee", "shoulder", "back"]),
  }),
});

/**
 * Persists a normalized assessment (assessment + answers + health profile +
 * recommendation snapshot) and returns the recommendation for the UI.
 * Public by design — the funnel runs before sign-in.
 */
export const submitAssessment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const answers = data.answers as AssessmentInput;
    const result = recommend(answers);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishEvent } = await import("@/lib/events.server");

    const { data: assessment, error } = await supabaseAdmin
      .from("assessments")
      .insert({
        rsid: data.rsid ?? null,
        email: data.email ?? null,
        status: "completed",
        source: "chatb2k",
        completed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !assessment) {
      console.error("[assessment] insert failed", error);
      return { assessmentId: null, recommendation: result };
    }

    await supabaseAdmin.from("assessment_answers").insert(
      Object.entries(answers).map(([question_key, answer_value]) => ({
        assessment_id: assessment.id,
        question_key,
        answer_value: String(answer_value),
      })),
    );

    await supabaseAdmin.from("health_profiles").insert({
      assessment_id: assessment.id,
      primary_goal: answers.primary_goal,
      experience: answers.experience,
      time_availability: answers.time_availability,
      budget_range: answers.budget,
      mobility_notes: answers.mobility,
      equipment_profile: { available: answers.equipment } as never,
      nutrition_profile: { preference: answers.nutrition } as never,
    });

    await supabaseAdmin.from("recommendation_results").insert({
      assessment_id: assessment.id,
      engine_version: result.engine_version,
      primary_program_sku: result.primary_program_sku,
      equipment_skus: result.equipment_skus,
      membership_sku: result.membership_sku,
      nutrition_sku: result.nutrition_sku,
      upsell_score: result.upsell_score,
      confidence_score: result.confidence_score,
      payload: result as never,
    });

    await publishEvent("AssessmentCompleted", "assessment", assessment.id, {
      rsid: data.rsid ?? null,
    });
    await publishEvent("RecommendationGenerated", "assessment", assessment.id, {
      primary_program_sku: result.primary_program_sku,
      confidence_score: result.confidence_score,
    });

    return { assessmentId: assessment.id, recommendation: result };
  });