import { z } from 'zod';

export const kesWithdrawSchema = z.object({
  amount: z
    .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
    .positive('amount must be positive')
    .min(10, 'minimum withdrawal is KES 10')
    .max(150000, 'maximum single withdrawal is KES 150,000'),
  msisdn: z
    .string({ required_error: 'msisdn is required' })
    .regex(/^(254|0)(7|1)\d{8}$/, 'invalid M-Pesa number (e.g. 2547XXXXXXXX or 07XXXXXXXX)'),
  pin: z.string().optional(),
});

export const withdrawRequestSchema = z.object({
  amount: z
    .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
    .positive('amount must be positive')
    .min(1, 'minimum withdrawal is 1'),
  currency: z.enum(['USD', 'KES'], { required_error: 'currency is required' }),
  account_name: z.string({ required_error: 'account_name is required' }).min(2).max(100),
  account_number: z.string({ required_error: 'account_number is required' }).min(5).max(50),
  bank_name: z.string({ required_error: 'bank_name is required' }).min(2).max(100),
  bank_code: z.string().max(20).optional(),
  swift_code: z.string().max(20).optional(),
  narration: z.string().max(200).optional(),
});

export const transferRequestSchema = z.object({
  amount: z
    .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
    .positive('amount must be positive'),
  recipient_id: z.string({ required_error: 'recipient_id is required' }).min(1),
  currency: z.enum(['USD', 'KES', 'GEMS']).default('GEMS'),
  narration: z.string().max(200).optional(),
  pin: z.string().optional(),
});

export const approveSubmissionSchema = z.object({
  campaign_id: z.string({ required_error: 'campaign_id is required' }).min(1),
  user_id: z.string({ required_error: 'user_id is required' }).min(1),
});

export const cancelCampaignSchema = z.object({
  campaign_id: z.string({ required_error: 'campaign_id is required' }).min(1),
  reason: z.string().max(500).optional(),
});

export const requestRevisionSchema = z.object({
  campaign_id: z.string({ required_error: 'campaign_id is required' }).min(1),
  invite_id: z.string({ required_error: 'invite_id is required' }).min(1),
  feedback: z.string().max(1000).optional(),
});
