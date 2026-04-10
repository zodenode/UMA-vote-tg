import { createContext, useContext, type ReactNode, type Dispatch, type SetStateAction } from "react";

export type SessionData = {
  refCode: string;
  alertsOn: boolean;
};

export type Session = SessionData | null;

type Ctx = {
  session: Session;
  setSession: Dispatch<SetStateAction<Session>>;
};

const Ctx = createContext<Ctx | null>(null);

export function SessionProvider({
  session,
  setSession,
  children,
}: {
  session: Session;
  setSession: Dispatch<SetStateAction<Session>>;
  children: ReactNode;
}) {
  return <Ctx.Provider value={{ session, setSession }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error("SessionProvider missing");
  return c;
}
