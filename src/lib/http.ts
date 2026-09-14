// probe: deliberate type error, this branch must never merge
const probe: number = "not a number";
export { probe };

export function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
