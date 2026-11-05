# ChatB2K Omni Commerce Recommendations

- Supabase project: resonance-fitness (vbqjvmnhdtdhmeeudqnn)
- Function: `chatb2k-commerce-recommendations`
- Production endpoint: `https://vbqjvmnhdtdhmeeudqnn.supabase.co/functions/v1/chatb2k-commerce-recommendations`
- Deployment: ACTIVE, version 1
- Runtime source: `supabase/functions/chatb2k-commerce-recommendations/index.ts` in the Supabase project.

## Request

POST JSON:
```json
{
  "domain": "elite.resofit.fit",
  "intent": "creator",
  "limit": 6
}
```

Supported intent groups: creator, fitness, digital, coaching. The function ranks only published catalogue products with a Paystack-compatible fulfilment mode. It returns a destination based on the arriving domain and includes a creator catalogue-gap signal when no published creator products match.

## Routing map

- `elite.resofit.fit` → `https://elite.resofit.fit/shop`
- `store.resofit.fit` → `https://store.resofit.fit/shop`
- `shop.resofit.fit` → `https://shop.resofit.fit`
- `resofit.fit` → `https://resofit.fit/shop`
- `account.resofit.fit` → Elite shop destination for upgrade discovery.

## Guardrails

- Recommendation endpoint is read-only.
- It never initializes payment or marks an order paid.
- Paystack `paystack-init` remains the checkout authority.
- Only published products with fulfilment mode `physical`, `digital`, `hybrid`, or `service` are eligible.
- Jumia candidates remain unpublishable until source resale authorization, media rights, product evidence, landed cost and inventory/fulfilment are verified.
- Trial status is read only for a verified bearer user; this endpoint does not modify entitlements.
