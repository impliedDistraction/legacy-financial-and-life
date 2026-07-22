export const CAMPAIGN_RETURN_TYPES = [
  'content_engagement',
  'appointment',
  'quote_request',
  'quote_issued',
  'policy_bound',
  'recruitment_commitment',
  'recruitment_conversion',
] as const;

export type CampaignReturnType = typeof CAMPAIGN_RETURN_TYPES[number];

export function isCampaignReturnType(value: unknown): value is CampaignReturnType {
  return typeof value === 'string'
    && (CAMPAIGN_RETURN_TYPES as readonly string[]).includes(value);
}