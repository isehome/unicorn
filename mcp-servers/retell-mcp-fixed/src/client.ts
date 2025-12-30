import Retell from "retell-sdk";

export const createRetellClient = (apiKey: string): Retell => {
  if (!apiKey) {
    throw new Error("No Retell API key available");
  }
  return new Retell({
    apiKey,
  });
};
