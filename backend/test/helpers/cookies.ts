import type { Response } from 'supertest';

export function setCookies(res: Response): string[] {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Value of a cookie set by the response, or undefined when the response did not set it. */
export function cookieValue(res: Response, name: string): string | undefined {
  const line = setCookies(res).find((cookie) => cookie.startsWith(`${name}=`));
  return line?.split(';')[0].slice(name.length + 1);
}
