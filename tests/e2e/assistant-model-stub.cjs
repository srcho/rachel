// Local E2E only: intercept the provider boundary; application/SDK/tools/DB remain real.
if (process.env.RACHEL_E2E_MODEL_STUB !== "1")
  throw new Error("The model stub requires explicit local E2E mode");
const realFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url = typeof input === "string" ? input : (input.url ?? String(input));
  if (url.startsWith("https://api.openai.com/")) {
    if (!url.endsWith("/responses"))
      throw new Error("E2E blocked non-Responses model request");
    const id = "e2e-response";
    const item = {
      id: "e2e-message",
      type: "message",
      role: "assistant",
      status: "completed",
      content: [
        {
          type: "output_text",
          text: "브라우저 검증 응답입니다.",
          annotations: [],
        },
      ],
    };
    const response = {
      id,
      created_at: 1788600000,
      model: "gpt-5.6-luna",
      status: "completed",
      output: [item],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const chunks = [
      { type: "response.created", response },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { ...item, content: [] },
      },
      {
        type: "response.output_text.delta",
        output_index: 0,
        content_index: 0,
        item_id: item.id,
        delta: "브라우저 검증 응답입니다.",
      },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response },
    ];
    return new Response(
      chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(""),
      { headers: { "content-type": "text/event-stream" } },
    );
  }
  return realFetch.call(this, input, init);
};
