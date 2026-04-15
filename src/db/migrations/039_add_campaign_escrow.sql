UPDATE act_campaigns
SET funding_status = 'funded'
WHERE status IN ('open_to_applications', 'active', 'completed', 'closed')
  AND funding_status = 'unfunded';
