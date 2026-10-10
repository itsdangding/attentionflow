export function unwrapResponse(response: unknown): any {
  if (
    response !== null &&
    typeof response === "object" &&
    "__attentionflowError" in response &&
    typeof response.__attentionflowError === "string"
  )
    throw new Error(response.__attentionflowError);
  return response;
}

export async function sendMessage(message: unknown) {
  return unwrapResponse(await browser.runtime.sendMessage(message));
}
