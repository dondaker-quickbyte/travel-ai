export async function GET({ url }) {
  return new Response(
    JSON.stringify({
      status: "ok",
      message: "Flights API is working",
      query: Object.fromEntries(url.searchParams)
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}