import React, { createContext, useContext, useEffect, useState } from "react";
import Cookies from "js-cookie";

const API_URL = "https://userstack.app/api/alpha";

interface UserstackProviderProps {
  children: React.ReactNode;
  appId: string;
}

type UserstackContextType = {
  identify: (credential: string, data: any) => void;
  forget: () => void;
  sessionId: string;
  flags: string[];
  currentPlan: string;
};

const UserstackContext = createContext<UserstackContextType>({
  identify: async (credential: string, data: any) => {},
  forget: () => {},
  sessionId: "",
  flags: [],
  currentPlan: "none",
});

export function UserstackProvider({ children, appId }: UserstackProviderProps) {
  const [sessionId, setSessionId] = useState("");
  const [currentPlan, setCurrentPlan] = useState("none");
  const [flags, setFlags] = useState([]);

  useEffect(() => {
    const session = Cookies.get(`_us_session`);
    if (session) {
      const sessionData = JSON.parse(session);
      setSessionId(sessionData.sessionId);
      setCurrentPlan(sessionData.plan);
      setFlags(sessionData.flags);
    }
  }, []);

  const values = {
    identify: async (credential: string, { data }: { data: any }) => {
      const response = await fetch(`${API_URL}/identify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Userstack-App-Id": appId,
        },
        body: JSON.stringify({
          credential,
          data,
        }),
      });

      if (response.ok) {
        const sessionData = await response.json();
        Cookies.set(`_us_session`, JSON.stringify(sessionData), {
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

  return (
    <UserstackContext.Provider value={values}>
      {children}
    </UserstackContext.Provider>
  );
}

export default function useRstack() {
  return useContext(UserstackContext);
}
