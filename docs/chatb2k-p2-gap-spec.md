# ChatB2K™ P2 Gap Specification

## Operating definition

ChatB2K™ = Personalized Wellness Commerce Intelligence.

Target journey:

Discover → Assess → Recommend → Source → Convert → Fulfill → Follow Up → Upsell → Retain

ChatB2K owns the decision layer, not every product. It may recommend first-party products, verified external commerce, approved service providers, personalized digital services, coaching, memberships, bundles, or combinations of these.

## Baseline

The v3 implementation already contains a strong first-party commerce spine: structured assessment and recommendation, server-side catalog pricing, multi-rail checkout, event/audit infrastructure, fulfillment allocation, inventory reservation, and customer-success automation.

The principal P2 gap is that recommendation is still bounded by the first-party catalog and there is no verified external-commerce/service-provider supply layer.

## Capability matrix

| Capability | Status | P2 action |
|---|---|---|
| Free-form need discovery | Partial | Add intent extraction above assessment |
| Structured assessment | Live | Extend fields, preserve current engine |
| Explicit numeric budget | Partial | Add budget amount/currency/range |
| Location-aware recommendation | Partial | Promote location from checkout to decision layer |
| First-party catalog | Live | Preserve as source adapter |
| Personalized recommendation | Live | Generalize from SKU ranking to solution ranking |
| External commerce | Missing | Add source-adapter framework |
| External verification | Missing | Require source, timestamp, seller, price/availability evidence |
| Service providers | Missing | Add provider registry and matching |
| Purchase routing | Live | Extend checkout to recommendation/source objects |
| Fulfillment | Live/Partial | Preserve primitives; reconcile canonical production state |
| Customer-success automation | Live/Partial | Connect to journey state |
| Upsell | Partial | Evolve to next-best-action |
| Retention | Partial | Add outcome/progress/recommendation loop |

## Proposed domain model

### solution_requests

Represents the normalized customer need.

Suggested fields:
- id
- customer_id / anonymous_id
- session_id
- rsid
- raw_request
- intent
- goal
- budget_minor
- currency
- country_code
- region
- delivery_location
- constraints JSONB
- lifecycle_stage
- urgency
- created_at

### commerce_sources

Registry of approved first-party and external supply sources.

Suggested fields:
- id
- code
- name
- source_type: first_party | marketplace | retailer | partner
- domain
- active
- verification_policy JSONB
- created_at

### sourced_offers

Normalized offer returned by a source adapter.

Suggested fields:
- id
- solution_request_id
- source_id
- external_product_id
- title
- description
- url
- seller_name
- seller_id
- price_minor
- currency
- availability
- condition
- specifications JSONB
- delivery_estimate
- location
- source_timestamp
- verification_status
- verification_timestamp
- raw_reference JSONB

### recommendation_runs

Stores the decision rather than only the displayed SKU.

Suggested fields:
- id
- solution_request_id
- algorithm_version
- customer_context JSONB
- candidates JSONB
- selected_offer_id
- confidence
- rationale
- created_at

### service_providers

Approved fulfillment/service supply.

Suggested fields:
- id
- provider_type
- name
- service_area
- capabilities JSONB
- pricing JSONB
- availability_status
- verification_status
- contact_reference

### journey_state

Canonical customer lifecycle state.

Suggested fields:
- customer_id / anonymous_id
- current_stage
- current_goal
- active_solution_id
- last_purchase_id
- fulfillment_status
- experience_status
- progress JSONB
- next_best_action JSONB
- updated_at

## Source adapter contract

Every commerce source should implement the same conceptual interface:

```ts
interface CommerceSourceAdapter {
  sourceCode: string;
  search(input: CommerceSearchInput): Promise<SourcedOffer[]>;
  verify(offer: SourcedOffer): Promise<VerifiedOffer>;
}
```

No adapter may mark an offer verified unless it has sufficient live/source evidence.

The LLM must never fabricate an external offer, price, seller, availability, delivery estimate, or URL.

## Recommendation contract

```ts
interface SolutionRecommendation {
  requestId: string;
  intent: string;
  goal: string;
  budget?: Money;
  location?: Location;
  selected: {
    source: 'first_party' | 'external' | 'service_partner';
    offerId: string;
    reason: string;
    confidence: number;
  };
  alternatives: Array<{
    offerId: string;
    reason: string;
  }>;
  verification: {
    status: 'verified' | 'unverified' | 'stale';
    checkedAt: string;
  };
  nextBestActions: NextBestAction[];
}
```

## Event additions

Preserve the existing canonical event stream and add:

- SolutionRequested
- IntentResolved
- CommerceSearchStarted
- CommerceOfferFound
- CommerceOfferVerified
- CommerceOfferRejected
- RecommendationCompared
- SolutionRecommended
- ExternalLeadCreated
- ExternalPurchaseClicked
- ServiceProviderMatched
- ServiceFulfillmentStarted
- ExperienceCheckinDue
- ProgressReviewed
- NextBestActionGenerated

All events should carry attribution where available: rsid, session_id, anonymous_id, funnel_origin, and UTM context.

## P2 API surface

Suggested server endpoints/functions:

- POST /api/public/chatb2k/intent
- POST /api/public/chatb2k/solution-search
- POST /api/public/chatb2k/recommendation
- GET /api/public/chatb2k/offers/:id
- POST /api/public/chatb2k/offers/:id/verify
- POST /api/public/chatb2k/external-lead
- POST /api/public/chatb2k/service-match
- GET /api/public/chatb2k/journey
- POST /api/public/chatb2k/check-in
- POST /api/public/chatb2k/next-action

Existing checkout/payment endpoints remain the financial authority.

## Verification rules

1. Never invent external inventory.
2. Never invent external price.
3. Never invent seller identity.
4. Never invent delivery timing.
5. Never generate a fake external URL.
6. Every external offer has a source timestamp.
7. Stale offers are explicitly labelled or excluded.
8. Failed verification removes the offer from authoritative recommendations.
9. Estimates must be explicitly labelled as estimates.
10. First-party prices remain server-authoritative at checkout.

## Ranking model

A P2 solution should be ranked on more than product similarity.

Suggested score dimensions:

- goal fit
- budget fit
- location/delivery fit
- specification fit
- source reliability
- availability confidence
- total landed cost
- service compatibility
- customer stage
- expected outcome/value

The score should be explainable and versioned.

## Example

Customer:

> I want to build a home gym but only have ₦300,000.

Expected flow:

1. Resolve intent = home strength training.
2. Resolve budget = ₦300,000 NGN.
3. Resolve location or request it if material.
4. Search first-party catalog.
5. Search enabled external sources.
6. Verify returned offers.
7. Normalize price/specification/delivery/source data.
8. Rank solutions against the customer's goal and budget.
9. Present best solution plus alternatives and explain why.
10. Route first-party purchase through existing checkout or external purchase/lead flow through the verified source.
11. Store recommendation and journey state.
12. Trigger relevant delivery/installation experience.
13. Recommend the next appropriate meal/workout/digital/coaching/membership step.

## Implementation order

### P2.1 Intent layer
Add free-form intent parsing without replacing the existing assessment.

### P2.2 Solution object
Generalize recommendation from SKU output to a source-aware solution object.

### P2.3 Source abstraction
Create source registry and adapter contracts.

### P2.4 Verification
Implement source evidence, freshness and verification state.

### P2.5 External commerce
Activate approved sources incrementally. Never hardcode marketplace assumptions into the core reasoning layer.

### P2.6 Service providers
Add provider registry and matching after commerce source abstraction is stable.

### P2.7 Journey state
Connect purchase, fulfillment, experience and progress into a durable customer journey.

### P2.8 Next-best-action
Replace product-only upsell logic with stage-aware next-best-action recommendations.

## Acceptance tests

### AT-01 First-party match
A customer request that maps cleanly to an in-stock first-party product produces a verified first-party recommendation and existing checkout path.

### AT-02 Budget constraint
A ₦300,000 request must not recommend a solution whose authoritative total exceeds the stated budget unless the user explicitly accepts over-budget alternatives.

### AT-03 External source
If first-party supply is inadequate and an enabled external source returns a verified matching offer, ChatB2K may recommend it with source attribution.

### AT-04 No fabrication
If no external source can be verified, ChatB2K must say so and must not invent a product, seller, price or link.

### AT-05 Stale offer
A stale offer cannot be represented as currently available.

### AT-06 Location
Location-sensitive recommendations must use the customer's supplied or verified location; otherwise ChatB2K asks for the missing information when material.

### AT-07 Payment authority
Client-submitted prices cannot override server-side first-party catalog pricing.

### AT-08 Fulfillment
A successful physical first-party purchase creates the existing fulfillment lifecycle and inventory reservation path.

### AT-09 Journey continuation
A completed purchase can produce an appropriate next-best action based on customer goal and lifecycle stage.

### AT-10 Attribution
Recommendation and conversion events preserve rsid/session/anonymous attribution where available.

## Non-goals for the first P2 activation

- Do not rewrite the existing assessment UI.
- Do not replace Paystack.
- Do not replace the first-party catalog.
- Do not rebuild fulfillment.
- Do not introduce unverified marketplace scraping as a shortcut.
- Do not allow the LLM to act as a source of commerce truth.

## Definition of done

P2 is ready for controlled activation when ChatB2K can take an arbitrary customer need, normalize intent/budget/location/goal, evaluate first-party and enabled verified external/service supply, produce an explainable source-aware recommendation, route the appropriate conversion path, persist journey state, and generate the next-best action without fabricating commerce facts.