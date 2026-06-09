// Amazon Solicitations API (SP-API) — the COMPLIANT "Request a Review".
// Sends Amazon's own neutral template (product review + seller feedback) for an
// order, only within Amazon's allowed window (5-30 days after delivery). This is
// permitted even for sellers restricted from proactive buyer-seller messaging.
// Prohibited (do NOT attempt): cherry-picking positive reviews, asking to change a
// review, or offering incentives. We only ever fire the neutral one-per-order action.
//
// Docs: https://developer-docs.amazon.com/sp-api/docs/solicitations-api

import { spRequest, type SpApiConfig } from "./sp-api";

const BASE = "/solicitations/v1";
const PRODUCT_REVIEW_ACTION = "productReviewAndSellerFeedback";

interface ActionsResponse {
  _links?: { actions?: { href: string; name: string }[] };
  _embedded?: unknown;
}

/**
 * Which solicitation actions are available for this order RIGHT NOW. Amazon only
 * returns an action while the order is inside the eligible window, so an empty
 * result means "not eligible (yet / anymore) or already solicited".
 */
export async function getSolicitationActions(
  cfg: SpApiConfig,
  amazonOrderId: string,
  marketplaceId: string,
): Promise<string[]> {
  const path = `${BASE}/orders/${encodeURIComponent(amazonOrderId)}?marketplaceIds=${marketplaceId}`;
  try {
    const data = await spRequest<ActionsResponse>(cfg, path);
    return (data?._links?.actions ?? []).map((a) => a.name);
  } catch {
    // 400/404 here just means no actions available for this order; treat as none.
    return [];
  }
}

/** Fire Amazon's neutral product-review + seller-feedback request for the order. */
export async function requestProductReview(
  cfg: SpApiConfig,
  amazonOrderId: string,
  marketplaceId: string,
): Promise<void> {
  const path = `${BASE}/orders/${encodeURIComponent(amazonOrderId)}/solicitations/${PRODUCT_REVIEW_ACTION}?marketplaceIds=${marketplaceId}`;
  await spRequest<void>(cfg, path, { method: "POST" });
}

export function isProductReviewAvailable(actions: string[]): boolean {
  return actions.includes(PRODUCT_REVIEW_ACTION);
}
