import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SocialGems API',
      version: '1.0.0',
      description: 'Creator economy platform — brands × influencers in Kenya and beyond.',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            status:  { type: 'integer' },
            message: { type: 'string' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            status:  { type: 'integer', example: 400 },
            message: { type: 'string',  example: 'Validation failed' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field:   { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
        KesWithdrawRequest: {
          type: 'object',
          required: ['amount', 'msisdn'],
          properties: {
            amount: { type: 'number', minimum: 10, maximum: 150000, example: 500 },
            msisdn: { type: 'string', example: '254712345678' },
            pin:    { type: 'string', example: '1234' },
          },
        },
        WithdrawRequest: {
          type: 'object',
          required: ['amount', 'currency', 'account_name', 'account_number', 'bank_name'],
          properties: {
            amount:         { type: 'number',  example: 100 },
            currency:       { type: 'string',  enum: ['USD', 'KES'] },
            account_name:   { type: 'string',  example: 'John Doe' },
            account_number: { type: 'string',  example: '00123456789' },
            bank_name:      { type: 'string',  example: 'Equity Bank' },
            swift_code:     { type: 'string',  example: 'EQBLKENA' },
          },
        },
        EscrowRecord: {
          type: 'object',
          properties: {
            escrow_id:        { type: 'string' },
            campaign_id:      { type: 'string' },
            currency:         { type: 'string', enum: ['KES', 'USD'] },
            total_amount:     { type: 'number' },
            platform_fee_pct: { type: 'number' },
            platform_fee_amt: { type: 'number' },
            creator_pool:     { type: 'number' },
            status:           { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Wallet',    description: 'Creator & brand wallet operations' },
      { name: 'Campaigns', description: 'Campaign lifecycle management' },
      { name: 'Admin',     description: 'Admin-only operations' },
      { name: 'Escrow',    description: 'Escrow & financial reconciliation' },
      { name: 'Community', description: 'Community Hub feed & posts' },
    ],
    paths: {
      '/wallet/kesWithdraw': {
        post: {
          tags: ['Wallet'],
          summary: 'Withdraw KES via M-Pesa B2C',
          description: 'Deducts from `balance_available`, triggers M-Pesa B2C payout. Idempotent via `X-Idempotency-Key` header.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/KesWithdrawRequest' } } },
          },
          responses: {
            200: { description: 'Payout initiated successfully' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
            429: { description: 'Rate limit exceeded' },
          },
        },
      },
      '/wallet/withdrawRequest': {
        post: {
          tags: ['Wallet'],
          summary: 'Request USD bank withdrawal',
          description: 'Creates a pending USD withdrawal. Admin reviews and marks PAID.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/WithdrawRequest' } } },
          },
          responses: {
            200: { description: 'Withdrawal request created' },
            400: { description: 'Validation error' },
            429: { description: 'Rate limit exceeded' },
          },
        },
      },
      '/wallet/getBalance': {
        get: {
          tags: ['Wallet'],
          summary: 'Get authenticated creator wallet balances',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Wallet balances returned' } },
        },
      },
      '/wallet/myKesWithdrawals': {
        get: {
          tags: ['Wallet'],
          summary: 'Creator KES withdrawal history',
          security: [{ bearerAuth: [] }],
          responses: { 200: { description: 'Last 50 KES withdrawal records' } },
        },
      },
      '/campaigns/approve-submission': {
        post: {
          tags: ['Campaigns'],
          summary: 'Brand approves a creator submission',
          description: 'Marks invite as completed, moves earnings to PENDING clearance.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object', required: ['campaign_id', 'invite_id'],
              properties: {
                campaign_id: { type: 'string' },
                invite_id:   { type: 'string' },
              },
            }}},
          },
          responses: {
            200: { description: 'Submission approved, earnings queued' },
            400: { description: 'Validation error' },
            403: { description: 'Not the campaign brand' },
          },
        },
      },
      '/campaigns/cancel': {
        post: {
          tags: ['Campaigns'],
          summary: 'Brand or admin cancels a campaign',
          description: 'Refunds unused escrow funds to brand wallet, rejects pending invites.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object', required: ['campaign_id'],
              properties: {
                campaign_id: { type: 'string' },
                reason:      { type: 'string' },
              },
            }}},
          },
          responses: {
            200: { description: 'Campaign cancelled, funds refunded' },
            404: { description: 'Campaign not found' },
          },
        },
      },
      '/admin/settings/escrow/reconciliation': {
        get: {
          tags: ['Escrow', 'Admin'],
          summary: 'Escrow reconciliation report',
          description: 'Compares escrow creator_pool vs allocated payment records per campaign.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: { description: 'Reconciliation data including flagged discrepancies' },
          },
        },
      },
      '/admin/auditLog': {
        get: {
          tags: ['Admin'],
          summary: 'Admin action audit log',
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: 'query', name: 'page',        schema: { type: 'integer', default: 1 } },
            { in: 'query', name: 'limit',       schema: { type: 'integer', default: 50 } },
            { in: 'query', name: 'adminUserId', schema: { type: 'string' } },
            { in: 'query', name: 'action',      schema: { type: 'string' } },
            { in: 'query', name: 'startDate',   schema: { type: 'string', format: 'date-time' } },
            { in: 'query', name: 'endDate',     schema: { type: 'string', format: 'date-time' } },
          ],
          responses: { 200: { description: 'Paginated audit log entries' } },
        },
      },
      '/activities/communityFeed': {
        get: {
          tags: ['Community'],
          summary: 'Community Hub unified feed',
          security: [{ bearerAuth: [] }],
          parameters: [
            { in: 'query', name: 'page',  schema: { type: 'integer', default: 1 } },
            { in: 'query', name: 'limit', schema: { type: 'integer', default: 20 } },
            { in: 'query', name: 'type',  schema: { type: 'string', enum: ['announcement', 'discussion', 'job_highlight', 'success_post'] } },
          ],
          responses: { 200: { description: 'Paginated feed items with section counts' } },
        },
      },
      '/activities/community/post': {
        post: {
          tags: ['Community'],
          summary: 'Create a discussion post',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: {
              type: 'object', required: ['text'],
              properties: {
                text:   { type: 'string', maxLength: 2000 },
                images: { type: 'array', items: { type: 'string' } },
              },
            }}},
          },
          responses: { 201: { description: 'Post created' } },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
