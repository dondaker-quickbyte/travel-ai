const GROQ_API_KEY = import.meta.env.GROQ_API_KEY;

type FlightIntent = {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string | null;
  budgetCurrency?: string | null;
  budgetAmount?: number | null;
  preference?: "cheapest" | "fastest" | "best" | null;
};

export async function POST({ request }: { request: Request }) {
  try {
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "GROQ_API_KEY is not configured on the server."
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json().catch(() => null);
    const message = body?.message?.toString().trim();

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Missing 'message' in request body." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1) Ask GROQ to extract structured flight intent
    const intent = await extractFlightIntentWithGroq(message);

    // 2) Call your existing /api/flights endpoint with extracted params
    const flights = await fetchFlightsFromInternalApi(request.url, intent);

    // 3) Ask GROQ to generate a hybrid reply (friendly + concise)
    const reply = await summariseFlightsWithGroq(message, intent, flights);

    return new Response(
      JSON.stringify({
        reply,
        intent,
        flights
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: "Unexpected error in chat API.",
        details: error?.message ?? String(error)
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function extractFlightIntentWithGroq(
  message: string
): Promise<FlightIntent> {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a flight intent parser. Extract flight search parameters from the user's message and return ONLY a JSON object with keys: origin, destination, departureDate, returnDate, budgetCurrency, budgetAmount, preference. " +
              'origin/destination should be city or airport names (e.g. "London", "Manchester", "Tenerife"). ' +
              'departureDate/returnDate should be ISO-like strings if possible (e.g. "2025-06-10" or "2025-06"). ' +
              'preference is one of: "cheapest", "fastest", "best", or null.'
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    }
  );

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;

  if (!content) {
    return {};
  }

  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch {
    return {};
  }
}

async function fetchFlightsFromInternalApi(
  requestUrl: string,
  intent: FlightIntent
): Promise<any> {
  const url = new URL(requestUrl);
  const base = `${url.protocol}//${url.host}`;

  const params = new URLSearchParams();
  if (intent.origin) params.set("origin", intent.origin);
  if (intent.destination) params.set("destination", intent.destination);
  if (intent.departureDate) params.set("departureDate", intent.departureDate);
  if (intent.returnDate) params.set("returnDate", intent.returnDate);
  if (intent.preference) params.set("preference", intent.preference);

  const flightsUrl = `${base}/api/flights?${params.toString()}`;

  const res = await fetch(flightsUrl);
  if (!res.ok) {
    return { error: `Flights API returned ${res.status}` };
  }

  return res.json();
}

async function summariseFlightsWithGroq(
  originalMessage: string,
  intent: FlightIntent,
  flights: any
): Promise<string> {
  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "You are a hybrid travel assistant: friendly but efficient. " +
              "First, briefly confirm what you understood (1–2 sentences). " +
              "Then, present the best options clearly with bullet points or short paragraphs. " +
              "Be concise, avoid fluff, and focus on what matters: origin, destination, dates, rough pricing, and trade-offs. " +
              "If data looks simulated or limited, still present it confidently as example options."
          },
          {
            role: "user",
            content: `User message: ${originalMessage}`
          },
          {
            role: "user",
            content:
              "Structured intent (JSON): " + JSON.stringify(intent, null, 2)
          },
          {
            role: "user",
            content:
              "Flight data from backend (JSON): " + JSON.stringify(flights, null, 2)
          }
        ]
      })
    }
  );

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  return content || "I’ve analysed your request and flight data, but I couldn’t generate a detailed summary.";
}