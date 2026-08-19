import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { recommend, type AssessmentInput } from "@/lib/commerce/recommendation";

const InputSchema = z.object({
  rsid: z.string().max(64).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  session_id: z.string().max(128).nullable().optional(),
  anon_id: z.string().max(128).nullable().optional(),
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
 * Persists the ChatB2K assessment into the canonical ResoFit customer and
 * event model. This intentionally does not recreate the retired v3
 * assessments/health_profiles/recommendation_results tables.
 */
export const submitAssessment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const answers = data.answers as AssessmentInput;
    const result = recommend(answers);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishEvent } = await import("@/lib/events.server");

    const snapshot = {
      answers,
      recommendation: result,
      captured_at: new Date().toISOString(),
      email: data.email ?? null,
      rsid: data.rsid ?? null,
    };

    // Canonical customer-intelligence store. Anonymous assessments are kept
    // without a user_id and can later be joined through rsid/session events.
    const { data: preference, error: preferenceError } = await supabaseAdmin
      .from("customer_preferences")
      .insert({
        user_id: null,
        goal: answers.primary_goal,
        fitness_level: answers.experience,
        activity_level: answers.time_availability,
        nutrition_style: answers.nutrition,
        assessment: snapshot as never,
      })
      .select("id")
      .single();

    if (preferenceError) {
      console.error("[assessment] customer_preferences insert failed", preferenceError);
    }

    const basePayload = {
      rsid: data.rsid ?? null,
      session_id: data.session_id ?? null,
      anon_id: data.anon_id ?? null,
      funnel_origin: "chatb2k",
    };

    await publishEvent("AssessmentCompleted", "assessment", preference?.id ?? null, {
      ...basePayload,
      email: data.email ?? null,
      answers,
    });

    await publishEvent("RecommendationGenerated", "assessment", preference?.id ?? null, {
      ...basePayload,
      primary_program_sku: result.primary_program_sku,
      equipment_skus: result.equipment_skus,
      membership_sku: result.membership_sku,
      nutrition_sku: result.nutrition_sku,
      ranked_skus: result.ranked_skus,
      confidence_score: result.confidence_score,
      upsell_score: result.upsell_score,
      engine_version: result.engine_version,
    });

    return {
      assessmentId: preference?.id ?? null,
      recommendation: result,
    };
  });
