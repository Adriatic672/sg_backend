import Model from './model';

export type SubscriptionTier = 'free' | 'plus' | 'pro';

const tierRank: Record<SubscriptionTier, number> = { free: 0, plus: 1, pro: 2 };

export function tierAtLeast(userTier: SubscriptionTier, required: SubscriptionTier): boolean {
  return tierRank[userTier] >= tierRank[required];
}

class TierResolver extends Model {}
const resolver = new TierResolver();

/**
 * Returns the user's active subscription tier by checking user_subscriptions
 * joined with subscriptions. Falls back to the cached column on users if the
 * join returns nothing (e.g. expired).
 */
export async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const rows: any = await resolver.callQuerySafe(`
    SELECT s.sub_tag
    FROM user_subscriptions us
    INNER JOIN subscriptions s ON us.subscription_id = s.id
    WHERE us.user_id = '${userId}'
      AND us.status = 'active'
    ORDER BY s.id DESC
    LIMIT 1
  `);

  if (rows && rows.length > 0) {
    const tag: string = rows[0].sub_tag;
    if (tag === 'CREATOR_PRO') return 'pro';
    if (tag === 'CREATOR_PLUS') return 'plus';
  }

  // Fallback to the denormalised column (set by webhook on subscribe/cancel)
  const userRows: any = await resolver.callQuerySafe(
    `SELECT subscription_tier FROM users WHERE user_id = '${userId}'`
  );
  if (userRows && userRows.length > 0) {
    const col = userRows[0].subscription_tier as string;
    if (col === 'pro' || col === 'plus') return col;
  }

  return 'free';
}

/**
 * Updates users.subscription_tier and users_profile.subscription_badge in one
 * call. Called from the Stripe webhook after a subscription is activated or
 * cancelled.
 */
export async function setUserTier(userId: string, tier: SubscriptionTier): Promise<void> {
  const badge = tier === 'free' ? 'none' : tier;
  await resolver.callQuerySafe(
    `UPDATE users SET subscription_tier = '${tier}' WHERE user_id = '${userId}'`
  );
  await resolver.callQuerySafe(
    `UPDATE users_profile SET subscription_badge = '${badge}' WHERE user_id = '${userId}'`
  );
}
