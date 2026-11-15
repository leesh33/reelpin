/**
 * api/youtube.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * GET /api/youtube?id=<videoId>
 *
 * 응답: { title, description, thumbnail, comments, channelId }
 *   · comments : 업로더(고정) 댓글을 맨 앞에 둔 상위 댓글 5개를 한 덩어리 텍스트로
 *   · channelId: videos.snippet.channelId (업로더 댓글을 가려내는 데 씀)
 *
 * 키는 **서버 환경변수**에만 둡니다.
 *   YOUTUBE_API_KEY (권장) 또는 EXPO_PUBLIC_YOUTUBE_API_KEY
 *   → 브라우저 번들에는 들어가지 않습니다.
 *
 * 키가 없으면 **무인증 oEmbed** 만으로 제목·썸네일을 돌려줍니다. (앱이 멈추지 않음)
 */
const { queryParam, fetchWithTimeout, sendJson, isGet, readJson, warn } = require('../server/http.js');

const YOUTUBE_VIDEO_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';
const YOUTUBE_COMMENTS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/commentThreads';
const YOUTUBE_OEMBED_ENDPOINT = 'https://www.youtube.com/oembed';
const COMMENTS_MAX = 5;
const COMMENT_MAX_CHARS = 300;

/** 영상 ID 모양 검사 (`[A-Za-z0-9_-]{6,20}`) — 이상한 값으로 업스트림을 찌르지 않습니다. */
function readVideoId(req) {
  const id = queryParam(req, 'id', 32);
  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : '';
}

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** 업로더 댓글을 먼저, 나머지는 받은(관련도) 순서대로 → 한 덩어리 텍스트 */
function commentsToText(items, uploaderChannelId) {
  const list = (Array.isArray(items) ? items : [])
    .map((item) => {
      const s =
        (item && item.snippet && item.snippet.topLevelComment && item.snippet.topLevelComment.snippet) || {};
      return {
        text: String(s.textDisplay || s.textOriginal || '').replace(/\s+/g, ' ').trim(),
        authorChannelId: String((s.authorChannelId && s.authorChannelId.value) || ''),
      };
    })
    .filter((c) => c.text);
  const owner = String(uploaderChannelId || '').trim();
  const ordered = owner
    ? list.filter((c) => c.authorChannelId === owner).concat(list.filter((c) => c.authorChannelId !== owner))
    : list;
  return ordered
    .map((c) => c.text.slice(0, COMMENT_MAX_CHARS))
    .join('\n')
    .slice(0, 1200);
}

/** 키 없이: oEmbed 한 번. 실패하면 null */
async function fetchOembed(videoId) {
  const url =
    YOUTUBE_OEMBED_ENDPOINT +
    '?url=' +
    encodeURIComponent('https://www.youtube.com/watch?v=' + videoId) +
    '&format=json';
  const json = await readJson(await fetchWithTimeout(url, { method: 'GET' }));
  if (!json) return null;
  const title = stripTags(json.title);
  if (!title) return null;
  return { title, thumbnail: json.thumbnail_url || null, authorName: String(json.author_name || '') };
}

module.exports = async function handler(req, res) {
  if (!isGet(req)) return sendJson(res, 405, { error: 'method-not-allowed' });

  const videoId = readVideoId(req);
  if (!videoId) return sendJson(res, 400, { error: 'missing-id', message: 'id(영상 ID)가 필요합니다.' });

  const key = process.env.YOUTUBE_API_KEY || process.env.EXPO_PUBLIC_YOUTUBE_API_KEY || '';

  // oEmbed 는 키가 있어도 썸네일 보강용으로 함께 띄웁니다. (기다리는 시간을 합치지 않음)
  const oembedPromise = fetchOembed(videoId);

  if (!key) {
    const oembed = await oembedPromise;
    if (!oembed) return sendJson(res, 502, { error: 'youtube-unavailable' });
    return sendJson(
      res,
      200,
      {
        title: oembed.title,
        description: '',
        thumbnail: oembed.thumbnail,
        comments: '',
        channelId: '',
        source: 'oembed',
      },
      600
    );
  }

  const videoUrl =
    YOUTUBE_VIDEO_ENDPOINT + '?part=snippet&id=' + encodeURIComponent(videoId) + '&key=' + encodeURIComponent(key);
  const commentsUrl =
    YOUTUBE_COMMENTS_ENDPOINT +
    '?part=snippet&videoId=' +
    encodeURIComponent(videoId) +
    '&order=relevance&maxResults=' +
    COMMENTS_MAX +
    '&textFormat=plainText&key=' +
    encodeURIComponent(key);

  const [videoJson, commentsJson, oembed] = await Promise.all([
    readJson(await fetchWithTimeout(videoUrl, { method: 'GET' })),
    readJson(await fetchWithTimeout(commentsUrl, { method: 'GET' })),
    oembedPromise,
  ]);

  const item = videoJson && videoJson.items && videoJson.items[0];
  const snippet = (item && item.snippet) || {};
  const channelId = String(snippet.channelId || '');
  const title = stripTags(snippet.title) || (oembed && oembed.title) || '';

  if (!item) {
    // Data API 가 아무것도 못 줬습니다 → oEmbed 로라도 제목을. (source 는 oembed)
    if (oembed) {
      return sendJson(
        res,
        200,
        {
          title: oembed.title,
          description: '',
          thumbnail: oembed.thumbnail,
          comments: '',
          channelId: '',
          source: 'oembed',
        },
        600
      );
    }
    warn('youtube: empty response for id=' + videoId);
    return sendJson(res, 502, { error: 'youtube-unavailable' });
  }

  if (!title && !snippet.description) {
    warn('youtube: empty snippet for id=' + videoId);
    return sendJson(res, 502, { error: 'youtube-unavailable' });
  }

  return sendJson(
    res,
    200,
    {
      title,
      description: String(snippet.description || '').slice(0, 3000),
      thumbnail:
        (oembed && oembed.thumbnail) ||
        (snippet.thumbnails && snippet.thumbnails.high ? snippet.thumbnails.high.url : null),
      comments: commentsToText((commentsJson && commentsJson.items) || [], channelId),
      channelId,
      source: 'youtube-api',
    },
    600
  );
};
