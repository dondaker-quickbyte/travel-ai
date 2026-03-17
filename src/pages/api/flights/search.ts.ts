import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  try {
    const token = import.meta.env.TRAVELPAYOUTS_API_TOKEN;
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'TRAVELPAYOUTS_API_TOKEN is missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(request.url);
    const origin = url.searchParams.get('origin');
    const destination = url.searchParams.get('destination');
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    if (!origin || !destination || !startDate || !endDate) {
      return new Response(
        JSON.stringify({
          error: 'Missing required query parameters: origin, destination, startDate, endDate'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiUrl = `https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=${origin}&destination=${destination}&departure_at=${startDate}&return_at=${endDate}&token=${token}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      const text = await response.text();
      return new Response(
        JSON.stringify({
          error: 'TravelPayouts API error',
          status: response.status,
          details: text
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    const normalised = (data?.data || []).map((item: any) => ({
      price: item.price,
      airline: item.airline,
      flightNumber: item.flight_number,
      departureAt: item.departure_at,
      returnAt: item.return_at,
      transfers: item.transfers,
      duration: item.duration,
      link: item.link
    }));

    return new Response(JSON.stringify({ flights: normalised }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: 'Unexpected server error',
        details: err?.message ?? String(err)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};