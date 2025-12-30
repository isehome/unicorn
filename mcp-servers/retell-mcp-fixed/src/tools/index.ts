import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import Retell from "retell-sdk";

import { registerCallTools } from "./call.js";
import { registerAgentTools } from "./agent.js";
import { registerPhoneNumberTools } from "./phone-number.js";
// import { registerKnowledgeBaseTools } from "./knowledge-base.js";
import { registerVoiceTools } from "./voice.js";
import { registerRetellLLMTools } from "./retell-llm.js";

export const registerAllTools = (server: McpServer, retellClient: Retell) => {
  registerCallTools(server, retellClient);
  registerAgentTools(server, retellClient);
  registerPhoneNumberTools(server, retellClient);
  //   registerKnowledgeBaseTools(server, retellClient);
  registerVoiceTools(server, retellClient);
  registerRetellLLMTools(server, retellClient);
};
