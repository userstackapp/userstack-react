import React, { createContext, useContext, useEffect, useState } from "react";
import Cookies from "js-cookie";

const API_URL = "https://api.userstack.app/alpha";
const DATA_TTL = 120000; // 2 minutes

interface UserstackProviderProps {
  children: React.ReactNode;
  appId: string;
}

interface IdentifyConfig {
  ttl?: number;
  data?: any;
  domainId?: string;
}

type UserstackContextType = {
  identify: (credential: string, config: any) => void;
  forget: () => void;
  sessionId: string;
  flags: string[];
  currentPlan: string;
};

const UserstackContext = createContext<UserstackContextType>({
  identify: async (credential: string, config: IdentifyConfig) => {},
  forget: () => {},
  sessionId: "",
  flags: [],
  currentPlan: "none",
});

export function UserstackProvider({ children, appId }: UserstackProviderProps) {
  const [sessionId, setSessionId] = useState("");
  const [currentPlan, setCurrentPlan] = useState("none");
  const [flags, setFlags] = useState([]);

  const values = {
    identify: async (credential: string, config: IdentifyConfig) => {
      const response = await fetch(`${API_URL}/identify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Userstack-App-Id": appId,
        },
        body: JSON.stringify({
          credential,
          config,
        }),
      });

      if (response.ok) {
        const sessionData = await response.json();
        const cookie = {
          time: new Date().getTime(),
          ...sessionData,
        };
        console.log("Userstack user identified:", cookie);
        Cookies.set(`_us_session`, JSON.stringify(cookie), {
          expires: config.ttl ? config.ttl / 60 / 24 : 36500, // default 100 years ie. forever
        });
      } else {
        console.error("Failed to identify user");
      }
    },
    refresh: async (sessionId: string) => {
      const response = await fetch(`${API_URL}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Userstack-App-Id": appId,
        },
        body: JSON.stringify({
          sessionId,
        }),
      });

      if (response.ok) {
        const sessionData = await response.json();
        const cookie = {
          time: new Date().getTime(),
          ...sessionData,
        };
        Cookies.set(`_us_session`, JSON.stringify(cookie), {
          expires: 36500, // 100 years should be enough
        });
      } else {
        console.error("Failed to identify user");
      }
    },
    forget: () => {
      Cookies.remove(`_us_session`);
      setSessionId("");
      setCurrentPlan("none");
      setFlags([]);
    },
    sessionId,
    flags,
    currentPlan,
  };

  useEffect(() => {
    const now = new Date().getTime();
    const session = Cookies.get(`_us_session`);

    if (session) {
      const sessionData = JSON.parse(session);
      if (sessionData.time + DATA_TTL > now) {
        setSessionId(sessionData.sessionId);
        setCurrentPlan(sessionData.plan);
        setFlags(sessionData.flags);
      } else {
        // We passed the TTL, so we should refresh the session
        values.refresh(sessionData.sessionId);
      }
    }
  }, []);

  return (
    <UserstackContext.Provider value={values}>
      {children}
    </UserstackContext.Provider>
  );
}

export default function useUserstack() {
  return useContext(UserstackContext);
}
