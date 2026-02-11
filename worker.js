let cachedToken = null;
let tokenExpireAt = 0;
let tokenFetchedAt = 0;

function formatTime(ms) {
  const d = new Date(ms);
  const pad = n => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function getToken(env) {
  const now = Date.now();

  if (cachedToken && now < tokenExpireAt) {
    return {
      access_token: cachedToken,
      cached: true,
      fetched_at: tokenFetchedAt
    };
  }

  const auth = btoa(`${env.CLIENT_ID}:${env.CLIENT_SECRET}`);

  const res = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + auth,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  const data = await res.json();

  cachedToken = data.access_token;
  tokenFetchedAt = now;
  tokenExpireAt = now + (data.expires_in - 30) * 1000;

  return {
    access_token: cachedToken,
    cached: false,
    fetched_at: tokenFetchedAt
  };
}

function mapToMusicFree(tracks) {
  return tracks.map(track => {
    return {
      id: track.id.toString(),
      name: track.title || "Unknown",
      artist: track.user?.username || "Unknown",
      album: track.publisher_metadata?.album_title || "",
      pic: track.artwork_url
        ? track.artwork_url.replace("-large", "-t500x500")
        : track.user?.avatar_url || "",
      url: track.permalink_url,
      source: "soundcloud"
    };
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/search") {
      const q = url.searchParams.get("q");
      const limit = url.searchParams.get("limit") || 20;

      if (!q) {
        return new Response(JSON.stringify({
          code: 400,
          message: "missing q"
        }), { status: 400 });
      }

      const tokenInfo = await getToken(env);

      const scRes = await fetch(
        `https://api.soundcloud.com/tracks?q=${encodeURIComponent(q)}&limit=${limit}`,
        {
          headers: {
            "Authorization": `Bearer ${tokenInfo.access_token}`
          }
        }
      );

      const scData = await scRes.json();

      const mapped = mapToMusicFree(scData);

      return new Response(JSON.stringify({
        code: 200,
        token_cached: tokenInfo.cached,
        token_fetched_time: formatTime(tokenInfo.fetched_at),
        token_fetched_timestamp: tokenInfo.fetched_at,
        list: mapped
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};