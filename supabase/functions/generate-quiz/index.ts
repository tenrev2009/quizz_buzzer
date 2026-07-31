import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk@0.70.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Le mode musical n'a pas de questions ecrites : seuls ces trois types
// correspondent a la contrainte question_type de quiz_questions.
type QuestionType = "choice_2" | "choice_4" | "buzzer";

interface GeneratedQuestion {
  question_text: string;
  question_type: QuestionType;
  options: string[];
  correct_index: number;
}

interface RequestBody {
  theme?: string;
  difficulty?: "facile" | "moyen" | "difficile";
  count_2?: number;
  count_4?: number;
  count_buzzer?: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getUserId(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

// Contraint la reponse a la forme exacte attendue par quiz_questions. Les
// questions au buzzer n'ont pas de reponses proposees : le modele renvoie une
// liste vide et un index 0, normalises en null avant insertion cote client.
const QUESTION_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question_text: { type: "string" },
          question_type: {
            type: "string",
            enum: ["choice_2", "choice_4", "buzzer"],
          },
          options: { type: "array", items: { type: "string" } },
          correct_index: { type: "integer" },
        },
        required: [
          "question_text",
          "question_type",
          "options",
          "correct_index",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Tu conçois des questions pour un quiz interactif joué en direct, animé par un présentateur devant des joueurs équipés de buzzers.

Règles de fabrication :
- Chaque question a une réponse factuelle unique et vérifiable. Pas d'opinion, pas de formulation ambiguë.
- Les questions sont courtes : elles sont lues à voix haute.
- Pour choice_2 : exactement 2 propositions, dont une seule correcte.
- Pour choice_4 : exactement 4 propositions, dont une seule correcte. Les 3 mauvaises réponses sont plausibles et du même registre que la bonne — jamais absurdes ni manifestement fausses.
- Pour buzzer : aucune proposition. Le joueur répond de tête, donc la réponse doit tenir en un mot ou un nom. Renvoie options: [] et correct_index: 0.
- Fais varier la position de la bonne réponse entre les questions ; ne la place pas systématiquement au même index.
- Aucune répétition : deux questions ne doivent pas porter sur le même fait.

Calibrage de la difficulté :
- facile : culture générale, connu du grand public.
- moyen : demande une connaissance réelle du thème sans être spécialisé.
- difficile : exige une connaissance approfondie, mais reste vérifiable et jamais anecdotique au point d'être injuste.

Écris en français.`;

async function generate(body: RequestBody): Promise<GeneratedQuestion[]> {
  const theme = (body.theme ?? "").trim();
  const difficulty = body.difficulty ?? "moyen";
  const count2 = Math.max(0, Math.min(30, body.count_2 ?? 0));
  const count4 = Math.max(0, Math.min(30, body.count_4 ?? 0));
  const countBuzzer = Math.max(0, Math.min(30, body.count_buzzer ?? 0));

  const total = count2 + count4 + countBuzzer;
  if (!theme) throw new Error("Le theme est obligatoire.");
  if (total === 0) throw new Error("Demandez au moins une question.");

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const parts = [
    `Thème : ${theme}`,
    `Difficulté : ${difficulty}`,
    "",
    "Génère exactement :",
    count2 > 0 ? `- ${count2} question(s) de type choice_2 (2 propositions)` : null,
    count4 > 0 ? `- ${count4} question(s) de type choice_4 (4 propositions)` : null,
    countBuzzer > 0 ? `- ${countBuzzer} question(s) de type buzzer (sans proposition)` : null,
    "",
    `Soit ${total} question(s) au total, ni plus ni moins.`,
  ].filter(Boolean);

  const params = {
    model: "claude-opus-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: QUESTION_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: parts.join("\n") }],
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };

  let message;
  try {
    // Streaming : une generation longue depasserait sinon le delai HTTP.
    const stream = client.beta.messages.stream(
      params as unknown as Parameters<typeof client.beta.messages.stream>[0],
    );
    message = await stream.finalMessage();
  } catch (e) {
    // Le repli serveur est un confort, pas une dependance : si la beta est
    // indisponible on refait la requete sans elle plutot que d'echouer.
    const detail = e instanceof Error ? e.message : String(e);
    if (!/fallback|beta/i.test(detail)) throw e;
    const { betas: _betas, fallbacks: _fallbacks, ...plain } = params;
    const stream = client.beta.messages.stream(
      plain as unknown as Parameters<typeof client.beta.messages.stream>[0],
    );
    message = await stream.finalMessage();
  }

  if (message.stop_reason === "refusal") {
    throw new Error(
      "Claude a refuse de generer ce quiz. Reformulez le theme.",
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "La generation a ete tronquee. Demandez moins de questions a la fois.",
    );
  }

  const text = message.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { questions?: GeneratedQuestion[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Reponse illisible du modele.");
  }

  const questions = parsed.questions ?? [];
  if (questions.length === 0) throw new Error("Aucune question generee.");

  // Le schema garantit la forme, pas la coherence : on ecarte ce qui ne
  // pourrait pas etre joue (index hors bornes, mauvais nombre de propositions).
  return questions.filter((q) => {
    if (!q.question_text?.trim()) return false;
    if (q.question_type === "buzzer") return true;
    const expected = q.question_type === "choice_2" ? 2 : 4;
    if (!Array.isArray(q.options) || q.options.length !== expected) return false;
    if (q.options.some((o) => !o?.trim())) return false;
    return q.correct_index >= 0 && q.correct_index < expected;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!getUserId(req)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!ANTHROPIC_API_KEY) {
    return json(
      { error: "ANTHROPIC_API_KEY absente des secrets de la fonction." },
      500,
    );
  }

  try {
    const body = (await req.json()) as RequestBody;
    const questions = await generate(body);
    return json({ questions });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
