import { useSyncExternalStore } from "react";
import { getWebPetitionSession, subscribeWebPetitionSession } from "./api";

export function useWebPetitionSessionToken(): string {
  return useSyncExternalStore(subscribeWebPetitionSession, getWebPetitionSession, () => "");
}
