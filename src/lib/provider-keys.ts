/** Client-safe store_setting keys for owner-managed provider credentials (ADR 0047). */
export const PROVIDER_KEYS = {
  telegramBotToken: 'telegram.bot_token',
  resendApiKey: 'resend.api_key',
  resendFrom: 'resend.from_email',
  baseUrl: 'app.base_url',
  smsApiKey: 'bulksms.api_key',
  smsSenderId: 'bulksms.sender_id',
} as const;

export type ProviderKey = (typeof PROVIDER_KEYS)[keyof typeof PROVIDER_KEYS];
export type ProviderField = keyof typeof PROVIDER_KEYS;
