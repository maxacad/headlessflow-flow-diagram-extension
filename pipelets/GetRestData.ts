export interface GetRestDataInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
}

export interface GetRestDataOutput {
  status: number;
  data: unknown;
}

export async function handle(input: GetRestDataInput): Promise<GetRestDataOutput> {
  const response = await fetch(input.url, {
    method: input.method ?? 'GET',
    headers: input.headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  return {
    status: response.status,
    data,
  };
}
