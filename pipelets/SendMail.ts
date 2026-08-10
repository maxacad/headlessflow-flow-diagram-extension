export interface SendMailInput {
  to: string;
  subject: string;
  body: string;
  from?: string;
}

export interface SendMailOutput {
  messageId: string;
  accepted: string[];
}

export async function handle(input: SendMailInput): Promise<SendMailOutput> {
  const messageId = `mail-${Date.now()}`;

  return {
    messageId,
    accepted: [input.to],
  };
}
