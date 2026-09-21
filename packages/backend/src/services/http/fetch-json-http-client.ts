import type { JsonHttpClient } from "../../contracts.js";

/** Default {@link JsonHttpClient} backed by the global `fetch`. */
export class FetchJsonHttpClient implements JsonHttpClient {
  public async getJson(url: string, params: Record<string, string>): Promise<unknown> {
    const query = new URLSearchParams(params).toString();
    const target = query.length > 0 ? `${url}?${query}` : url;

    let response: Response;
    try {
      response = await fetch(target);
    } catch (error: unknown) {
      throw new Error("The request could not reach the service. Check your connection and try again.", {
        cause: error,
      });
    }

    if (!response.ok) {
      throw new Error(`The service returned an unexpected response (HTTP ${response.status}).`);
    }
    return response.json();
  }
}
