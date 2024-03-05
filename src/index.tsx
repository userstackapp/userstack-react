import React, { createContext, useContext, useEffect, useState } from "react";
import Cookies from "js-cookie";

const API_URL = "https://api.userstack.app/alpha2";
const DATA_TTL = 120000; // 2 minutes

interface UserstackProviderProps {
  children: React.ReactNode;
  appId: string;
}

interface IdentifyConfig {
  ttl?: number;
  groupId?: string;
  groupName?: string;
  data?: any;
}

interface SessionData {
  sessionId: string;
  plan: string;
  flags: { [key: string]: boolean | string | number };
  time: number;
}

type UserstackContextType = {
  identify: (credential: string, config: IdentifyConfig) => Promise<void>;
  forget: () => void;
  sessionId: string;
  flags: { [key: string]: boolean | string | number };
  currentPlan: string;
  upgrade: (
    planId: string,
    successUrl: string,
    cancelUrl: string
  ) => Promise<void>;
  setIdGroup: (groupId: string) => Promise<void>;
  summary: () => Promise<void>;
};

const UserstackContext = createContext<UserstackContextType>(
  {} as UserstackContextType
);

const calculateCookieExpiry = (ttl: number = 36500) => {
  // Convert TTL to days for cookie expiration
  return ttl / 60 / 24;
};

export const UserstackProvider: React.FC<UserstackProviderProps> = ({
  children,
  appId,
}) => {
  const [sessionId, setSessionId] = useState<string>("");
  const [currentPlan, setCurrentPlan] = useState<string>("none");
  const [flags, setFlags] = useState<{
    [key: string]: boolean | string | number;
  }>({});

  const identify = async (
    credential: string,
    config: IdentifyConfig
  ): Promise<void> => {
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
      const sessionData: SessionData = await response.json();
      const cookie = {
        ...sessionData,
        time: Date.now(),
      };
      console.log("Userstack user identified:", cookie);
      Cookies.set("_us_session", JSON.stringify(cookie), {
        expires: calculateCookieExpiry(config.ttl),
      });
    } else {
      console.error("Failed to identify user");
    }
  };

  const refresh = async (sessionId: string): Promise<void> => {
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
      console.log("Userstack session refreshed:", cookie);
      setSessionId(cookie.sessionId);
      setCurrentPlan(cookie.plan);
      setFlags(cookie.flags);
      Cookies.set(`_us_session`, JSON.stringify(cookie), {
        expires: 36500, // 100 years should be enough
      });
    } else {
      console.error("Failed to identify user");
    }
  };

  const forget = (): void => {
    Cookies.remove("_us_session");
    setSessionId("");
    setCurrentPlan("none");
    setFlags({});
  };

  const upgrade = async (
    planId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<void> => {
    if (!sessionId || sessionId === "") {
      console.error("Userstack error: No session ID found");
      return;
    }

    if (!planId || planId === "") {
      console.error("Userstack error: No plan ID provided");
      return;
    }

    const response = await fetch(`${API_URL}/upgrade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Userstack-App-Id": appId,
      },
      body: JSON.stringify({
        sessionId,
        planId,
        successUrl,
        cancelUrl,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const redirectUrl = data.redirectUrl;

      if (redirectUrl) {
        window.location.href = redirectUrl;
      }
    } else {
      console.error("Failed to upgrade user:", await response.text());
    }
  };

  const setIdGroup = async (groupId: string): Promise<void> => {
    const response = await fetch(`${API_URL}/setgroup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Userstack-App-Id": appId,
      },
      body: JSON.stringify({
        sessionId,
        groupId,
      }),
    });

    if (response.ok) {
      const sessionData = await response.json();
      const cookie = {
        time: new Date().getTime(),
        ...sessionData,
      };
      console.log("Userstack group changed:", cookie);
      setSessionId(cookie.sessionId);
      setCurrentPlan(cookie.plan);
      setFlags(cookie.flags);
      Cookies.set(`_us_session`, JSON.stringify(cookie), {
        expires: 36500, // 100 years should be enough
      });
    } else {
      console.error("Failed to set new group ID");
    }
  };

  const summary = async (): Promise<void> => {
    const response = await fetch(`${API_URL}/summary`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Userstack-App-Id": appId,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      console.error("Failed to fetch user summary:", await response.text());
    }
  };

  useEffect(() => {
    const session = Cookies.get("_us_session");

    if (session) {
      const sessionData: SessionData = JSON.parse(session);
      const now = Date.now();
      if (sessionData.time + DATA_TTL > now) {
        setSessionId(sessionData.sessionId);
        setCurrentPlan(sessionData.plan);
        setFlags(sessionData.flags);
      } else {
        refresh(sessionData.sessionId).catch(console.error);
      }
    }
  }, []);

  return (
    <UserstackContext.Provider
      value={{
        identify,
        forget,
        sessionId,
        flags,
        currentPlan,
        upgrade,
        setIdGroup,
        summary,
      }}
    >
      {children}
    </UserstackContext.Provider>
  );
};

export const useUserstack = (): UserstackContextType => {
  const context = useContext(UserstackContext);
  if (context === undefined) {
    throw new Error("useUserstack must be used within a UserstackProvider");
  }
  return context;
};

export default useUserstack;

// Backend-compatible functions

export const summary = async (appId: string, apiKey: string): Promise<void> => {
  const response = await fetch(`${API_URL}/summary`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Userstack-App-Id": appId,
      Authorization: `Basic ${apiKey}`,
    },
  });

  if (response.ok) {
    const data = await response.json();
    return data;
  } else {
    console.error("Failed to fetch user summary:", await response.text());
  }
};
