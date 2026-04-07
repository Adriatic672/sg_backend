import { OpenAI } from "openai";

class DailyMessageGenerator {
  private openai: OpenAI;
  private prompt: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Missing OPENAI_API_KEY in environment variables");
    }

    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.prompt =
      "Generate a positive and uplifting daily message with a title for app users in JSON format. make it 25 words max.  The message is intended for influencers and should capture cool vibes about Social Gems, a brand-to-influencer app that connects brands to influencers, influencers can get paid for completing campaigns. Example: {\"status\": \"success\", \"title\": \"Good Morning\", \"message\": \"Rise and shine! Enjoy cool vibes and fresh opportunities with Social Gems today.\"}";
  }

  public async generateMessage() {
    console.log("generateMessage STARTED");
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: this.prompt }],
        max_tokens: 100,
        temperature: 0.9,
      });
      

      const jsonResponse = JSON.parse(response.choices[0]?.message?.content || "{}");
      console.log("jsonResponse", jsonResponse);
      return jsonResponse;
    } catch (error) {
      console.error("Error generating message:", error);
      return { status: "error", title: "", message: "Failed to generate a message." };
    }
  }
}

export default DailyMessageGenerator;
