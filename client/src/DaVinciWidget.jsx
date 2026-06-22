import { useEffect, useRef, useState } from 'react';

const loadStylesheet = (href) => {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
};

const loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

// Stores the DaVinci session token so the server can resume the flow via /dvtoken.
const setCookie = (name, value, options = {}) => {
  let cookieString = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) {
    cookieString += `; Max-Age=${options.maxAge}`;
  }
  cookieString += '; Secure';
  cookieString += '; SameSite=Strict';
  document.cookie = cookieString;
};

export default function DaVinciWidget() {
  const containerRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const successCallback = (response) => {
      console.log(response);
      if (response?.sessionToken) {
        setCookie('DV-ST', response.sessionToken, { maxAge: 86400 });
      }
    };
    const errorCallback = (err) => console.error(err);
    const onCloseModal = () => console.log('onCloseModal');

    (async () => {
      try {
        // Region and policyId are not secret; the API key/companyId stay server-side.
        const configResponse = await fetch('/widget-config');
        if (!configResponse.ok) {
          throw new Error('Failed to retrieve widget configuration from server.');
        }
        const { region, policyId } = await configResponse.json();

        loadStylesheet(`https://assets.pingone.${region}/ux/end-user-nano/0.1.0-alpha.9/end-user-nano.css`);
        loadStylesheet(`https://assets.pingone.${region}/ux/astro-nano/0.1.0-alpha.11/icons.css`);
        await loadScript(`https://assets.pingone.${region}/davinci/latest/davinci.js`);

        const tokenResponse = await fetch('/dvtoken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://localhost:3000'},
          credentials: 'include', // send the DV-ST cookie, if present
          body: JSON.stringify({ policyId }),
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json();
          throw new Error(errorData.error || 'Failed to retrieve DaVinci SDK token from server.');
        }
        console.log("tokenResponse\n"+tokenResponse)
        const { token, companyId, apiRoot } = await tokenResponse.json();
        console.log(tokenResponse)
        if (cancelled || !containerRef.current) return;

        const props = {
          config: {
            method: 'runFlow',
            apiRoot,
            accessToken: token,
            includeHttpCredentials: false,
            staggerFlowExecutions: false,
            flowTakeoverWaitTimeSeconds: 5,
            lockAcquisitionTimeoutSeconds: 300,
            companyId,
            policyId,
          },
          useModal: false,
          successCallback,
          errorCallback,
          onCloseModal,
        };

        window.davinci.skRenderScreen(containerRef.current, props);
      } catch (err) {
        if (!cancelled) {
          console.error('Error initializing DaVinci widget:', err);
          setError(err.message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {error && <p role="alert">Unable to load the flow: {error}</p>}
      <div ref={containerRef} className="dvWidget" />
    </div>
  );
}
