import React, { createContext, useContext, useEffect, useState } from 'react';
import Cookies from 'js-cookie';

const DEFAULT_API_URL = 'https://api-beta.userstack.app';
const DATA_TTL = 60 * 1000; // 1 minute

interface UserstackProviderProps {
  children: React.ReactNode;
  appId: string;
  customApiUrl?: string;
}

interface IdentifyConfig {
  ttl?: number;
  groupId?: string;
  groupName?: string;
  blockFree?: boolean;
  data?: any;
}

interface SessionData {
  sessionId: string;
  pkgId: string;
  flags: { [key: string]: boolean | string | number };
  time: number;
}

type UserstackContextType = {
  identify: (credential: string, config: IdentifyConfig) => Promise<void>;
  forget: () => void;
  sessionId: string;
  flags: { [key: string]: boolean | string | number };
  currentPackage: string;
  setGroup: (groupId: string) => Promise<void>;
};

const UserstackContext = createContext<UserstackContextType>(
  {} as UserstackContextType,
);

const calculateCookieExpiry = (ttl: number = 36500) => {
  // Convert TTL to days for cookie expiration
  return ttl / 60 / 24;
};

const getCookie = (): SessionData | null => {
  const cookieData = Cookies.get('_us_session');

  if (cookieData) {
    const currentCookie = JSON.parse(cookieData);
    return currentCookie;
  } else {
    console.error('Userstack session cookie missing');
    return null;
  }
};

export const UserstackProvider: React.FC<UserstackProviderProps> = ({
  children,
  appId,
  customApiUrl = DEFAULT_API_URL,
}) => {
  const [sessionId, setSessionId] = useState<string>('');
  const [currentPackage, setCurrentPackage] = useState<string>('none');
  const [flags, setFlags] = useState<{
    [key: string]: boolean | string | number;
  }>({});

  const identify = async (
    credential: string,
    config: IdentifyConfig,
  ): Promise<void> => {
    const response = await fetch(`${customApiUrl}/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Userstack-App-Id': appId,
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
      console.log('Userstack user identified:', cookie);
      Cookies.set('_us_session', JSON.stringify(cookie), {
        expires: calculateCookieExpiry(config.ttl),
      });
      setSessionId(cookie.sessionId);
      setCurrentPackage(cookie.pkgId);
      setFlags(cookie.flags);
    } else {
      const responseText = await response.text();
      console.error('Failed to identify user', responseText);
      throw new Error(responseText);
    }
  };

  const refresh = async (sessionId: string): Promise<void> => {
    const response = await fetch(`${customApiUrl}/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Userstack-App-Id': appId,
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
      console.log('Userstack session refreshed:', cookie);
      setSessionId(cookie.sessionId);
      setCurrentPackage(cookie.package);
      setFlags(cookie.flags);
      Cookies.set(`_us_session`, JSON.stringify(cookie), {
        expires: 36500, // 100 years should be enough
      });
    } else {
      console.error('Failed to identify user');
    }
  };

  const forget = (): void => {
    Cookies.remove('_us_session');
    setSessionId('');
    setCurrentPackage('none');
    setFlags({});
  };

  const setGroup = async (groupId: string): Promise<void> => {
    let sid = sessionId;
    if (!sid) {
      const cookie = getCookie();
      if (!cookie) {
        console.log('Userstack session cookie missing, cannot set group');
        return;
      }
      sid = cookie.sessionId;
    }

    const response = await fetch(`${customApiUrl}/setgroup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Userstack-App-Id': appId,
      },
      body: JSON.stringify({
        sessionId: sid,
        groupId,
      }),
    });

    if (response.ok) {
      const sessionData = await response.json();
      const cookie = {
        time: new Date().getTime(),
        ...sessionData,
      };
      console.log('Userstack group changed:', cookie);
      setSessionId(cookie.sessionId);
      setCurrentPackage(cookie.package);
      setFlags(cookie.flags);
      Cookies.set(`_us_session`, JSON.stringify(cookie), {
        expires: 36500, // 100 years should be enough
      });
    } else {
      console.error('Failed to set new group ID');
    }
  };

  useEffect(() => {
    const session = Cookies.get('_us_session');

    if (session) {
      const sessionData: SessionData = JSON.parse(session);
      const now = Date.now();
      if (sessionData.time + DATA_TTL > now) {
        setSessionId(sessionData.sessionId);
        setCurrentPackage(sessionData.pkgId);
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
        currentPackage,
        setGroup,
      }}
    >
      {children}
    </UserstackContext.Provider>
  );
};

export const useUserstack = (): UserstackContextType => {
  const context = useContext(UserstackContext);
  if (context === undefined) {
    throw new Error('useUserstack must be used within a UserstackProvider');
  }
  return context;
};

export default useUserstack;

// backend methods

export function readSessionFromCookie(cookieString: string | undefined) {
  if (!cookieString) {
    return null;
  }

  try {
    const match = cookieString.match(/_us_session=([^;]*)/);
    const value = match ? match[1] : '';
    const json = decodeURIComponent(value || '');
    const data = JSON.parse(json);
    return data;
  } catch (e) {
    return null;
  }
}

export const verifySession = async (
  apiKey: string,
  appId: string,
  sessionId: string,
  apiUrl?: string,
) => {
  const url = apiUrl || DEFAULT_API_URL;

  const result = await fetch(`${url}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${apiKey}`,
      'X-Userstack-App-Id': appId,
    },
    body: JSON.stringify({
      sessionId,
    }),
  });

  if (result.ok) {
    return await result.json();
  } else {
    throw new Error('Failed to verify session: ' + (await result.text()));
  }
};
