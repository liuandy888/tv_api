// ========== 配置 & 工具函数 ==========
const currentHost = "http://wapi.kuwo.cn";
const searchHost = "https://search.kuwo.cn";
const nmobiHost = "https://nmobi.kuwo.cn";
const lyricHost = "https://kuwo.cn";
const picServerHost = "http://artistpicserver.kuwo.cn";
const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
};

// 你原有请求封装 reqSafe 保持不变（此处仅占位）
// async function reqSafe(url, opt) { ... }

function quote(s) {
    return encodeURIComponent(s);
}

// 统一 JSON 请求：优先 reqSafe，失败回退 http
async function getJson(url, hdrs, timeout) {
    const opt = { method: "GET", headers: hdrs || {}, timeout: timeout || 10000 };
    if (typeof reqSafe === "function") {
        try {
            const res = await reqSafe(url, opt);
            let data = res && res.data;
            if (typeof data === "string") {
                try { data = JSON.parse(data); } catch (e) {}
            }
            if (data !== undefined && data !== null) return data;
            if (res && typeof res.content === "string") {
                try { return JSON.parse(res.content); } catch (e) {}
            }
        } catch (e) {}
    }
    if (typeof http === "function") {
        try {
            const r = await http(url, opt);
            if (r && typeof r.content === "string") return JSON.parse(r.content);
        } catch (e) {}
    }
    return null;
}

// 统一文本请求（封面接口返回纯文本 URL）
async function getText(url, hdrs, timeout) {
    const opt = { method: "GET", headers: hdrs || {}, timeout: timeout || 5000 };
    if (typeof reqSafe === "function") {
        try {
            const res = await reqSafe(url, opt);
            if (res) {
                if (typeof res.data === "string") return res.data;
                if (typeof res.text === "string") return res.text;
                if (typeof res.content === "string") return res.content;
            }
        } catch (e) {}
    }
    if (typeof http === "function") {
        try {
            const r = await http(url, opt);
            if (r && typeof r.content === "string") return r.content;
        } catch (e) {}
    }
    return "";
}

// 只替换开头的 http://
function toHttps(u) {
    return String(u || "").replace(/^http:\/\//, "https://");
}

// 清洗 HTML
function stripHtml(s) {
    return String(s || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}

// 格式化秒数 00:00.00
function _format_time(seconds) {
    const total = Number(seconds) || 0;
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}

// 构建 SSA 字幕（注意 SSA 头必须逐行）
function _create_ssa_subtitle(lrc_text) {
    const lines = [];
    const pattern = /\[(\d{2}):(\d{2})\.(\d{2})\](.*)/;
    
    for (const line of String(lrc_text || "").split("\n")) {
        const match = line.match(pattern);
        if (!match) continue;
        const minutes = parseInt(match[1], 10);
        const sec = parseInt(match[2], 10);
        const hundredths = parseInt(match[3], 10);
        const text = match[4].trim().replace(/,/g, "，"); 
        const totalSeconds = minutes * 60 + sec + hundredths / 100.0;
        if (text) lines.push({ start: totalSeconds, text });
    }
    if (!lines.length) return "";

    const ssa_header = `[Script Info]
ScriptType: v4.00+
Collisions: Normal
PlayResX: 1280
PlayResY: 720
Timer: 100.0000
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Roboto,50,&H00FFFFFF,&H00808080,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,1,1,2,10,10,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    function formatSsaTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        const cs = Math.floor((sec * 100) % 100);
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    }

    const events = [];
    for (let i = 0; i < lines.length; i++) {
        const current = lines[i];
        const currentEnd = (i + 1 < lines.length) ? lines[i + 1].start : current.start + 5.0;
        
        const wait1 = i + 1 < lines.length ? lines[i + 1] : null;
        const played1 = i - 1 >= 0 ? lines[i - 1] : null;
        
        const startStr = formatSsaTime(current.start);
        const endStr = formatSsaTime(currentEnd);

        const textPlayed = played1 ? played1.text : "　";
        const textWait = wait1 ? wait1.text : "　";

        // 【关键】每一行开头都重置颜色代码 \c&H...&，确保 Exo 能正确着色
        // 黄色: \c&H00FFFF&，绿色: \c&H00FF00&
        const line1 = `{\\c&H00FFFF&}${textPlayed}`;
        const line2 = `{\\c&H00FF00&}${current.text}`;
        const line3 = `{\\c&H00FFFF&}${textWait}`;

        // 使用 \N 强制换行
        const fullText = `${line1}\\N${line2}\\N${line3}`;
        
        events.push(`Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${fullText}`);
    }
    return ssa_header + events.join("\n");
}
// 获取歌手全部歌曲（最多 10 页 / 300 首）
async function _get_artist_songs(rid) {
    const headersSongs = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "http://www.kuwo.cn/"
    };
    const songs = [];
    const maxPages = 10;
    for (let page = 1; page <= maxPages; page++) {
        const url = `${currentHost}/api/www/artist/artistMusic?artistid=${rid}&pn=${page}&rn=30`;
        try {
            const data = await getJson(url, headersSongs, 10000);
            if (!data || Number(data.code) !== 200) break;
            const songList = (data.data && data.data.list) || [];
            if (!songList.length) break;
            for (const song of songList) {
                const songName = String(song.name || "").trim();
                if (songName) {
                    songs.push({
                        name: songName,
                        rid: song.rid || "",
                        album: song.album || "",
                        duration: song.duration || ""
                    });
                }
            }
            if (songs.length >= 300) {
                songs.splice(300);
                break;
            }
        } catch (e) {
            continue;
        }
    }
    return songs;
}
// ========== 纯 ES Base64 编码实现（QuickJS 兼容） ==========
function base64Encode(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
        } else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
            const next = str.charCodeAt(i + 1);
            const cp = 0x10000 + ((code - 0xD800) << 10) + (next - 0xDC00);
            bytes.push(
                0xF0 | (cp >> 18),
                0x80 | ((cp >> 12) & 0x3F),
                0x80 | ((cp >> 6) & 0x3F),
                0x80 | (cp & 0x3F)
            );
            i++;
        } else {
            bytes.push(
                0xE0 | (code >> 12),
                0x80 | ((code >> 6) & 0x3F),
                0x80 | (code & 0x3F)
            );
        }
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
        out += chars[b0 >> 2];
        out += chars[((b0 & 3) << 4) | (b1 >> 4)];
        out += i + 1 < bytes.length ? chars[((b1 & 0xF) << 2) | (b2 >> 6)] : "=";
        out += i + 2 < bytes.length ? chars[b2 & 0x3F] : "=";
    }
    return out;
}
// ========== 入口函数 ==========
async function init() {
    console.log("init ok");
}

async function home(filter) {
    const cateId = [
        { "type_name": "华语男", "type_id": "1" },
        { "type_name": "华语女", "type_id": "2" },
        { "type_name": "华语组合", "type_id": "3" },
        { "type_name": "日韩男", "type_id": "4" },
        { "type_name": "日韩女", "type_id": "5" },
        { "type_name": "日韩组合", "type_id": "6" },
        { "type_name": "欧美男", "type_id": "7" },
        { "type_name": "欧美女", "type_id": "8" },
        { "type_name": "欧美组合", "type_id": "9" },
        { "type_name": "其他", "type_id": "0" }
    ];
    return JSON.stringify({ class: cateId });
}

async function homeVod() {
    return await category("1", 1, false, {});
}

async function category(tid, pg, filter, extend) {
    const headersCat = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "http://www.kuwo.cn/"
    };
    const url = `${currentHost}/api/www/artist/artistInfo?category=${tid}&prefix=&pn=${pg}&rn=30`;
    let list = [];
    try {
        const data = await getJson(url, headersCat, 10000);
        if (data && data.data && data.data.artistList) {
            for (const item of data.data.artistList) {
                list.push({
                    vod_id: String(item.id || ""),
                    vod_name: item.name || "",
                    vod_pic: toHttps(item.pic300 || item.pic || item.pic120 || ""),
                    vod_remarks: ""
                });
            }
        }
    } catch (e) {
        console.error("category异常：", e.message || e);
        list = [];
    }
    return JSON.stringify({
        list,
        page: Number(pg),
        pagecount: 9999,
        limit: 30,
        total: 999999
    });
}

async function detail(ids) {
    let rid = Array.isArray(ids) ? ids[0] : ids;
    rid = String(rid || "");

    const headersDetail = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "http://www.kuwo.cn/"
    };
    const infoUrl = `${currentHost}/api/www/artist/artist?artistid=${rid}`;

    try {
        const data = await getJson(infoUrl, headersDetail, 10000);
        if (!data || !data.data) throw new Error("歌手信息为空");
        const artistInfo = data.data;
        const artistName = artistInfo.name || "";

        const allSongs = await _get_artist_songs(rid);

        let artistInfoText = stripHtml(artistInfo.info || "");
        if (!artistInfoText) artistInfoText = "暂无歌手简介";

        // 组装播放列表：歌曲名 - 专辑$歌曲rid，用 # 连接
        const playArr = [];
        for (const song of allSongs) {
            const name = String(song.name || "").replace(/[$#]/g, "").trim();
            const songId = song.rid || "";
            const album = song.album || "";
            if (album) playArr.push(`${name} - ${album}$${songId}`);
            else playArr.push(`${name}$${songId}`);
        }

        const vod = {
            vod_id: rid,
            vod_name: artistName,
            vod_pic: toHttps(artistInfo.pic300 || artistInfo.pic || ""),
            vod_content: artistInfoText,
            vod_remarks: `歌曲：${allSongs.length}首`,
            vod_actor: artistName,
            vod_play_from: "my musc",
            vod_play_url: playArr.join("#")
        };
        return JSON.stringify({ list: [vod] });
    } catch (e) {
        return JSON.stringify({
            list: [{
                vod_id: rid,
                vod_name: "加载失败",
                vod_content: `加载歌手信息失败: ${e.message || e}`,
                vod_remarks: "加载失败",
                vod_actor: "未知",
                vod_play_from: "my musc",
                vod_play_url: ""
            }]
        });
    }
}

async function play(flag, id, vipFlags) {
    const rid = String(id || "");
    const qualityList = [
        ["无损FLAC", 2000, "flac"],
        ["高品质320K", 320, "mp3"],
        ["标准128K", 128, "mp3"]
    ];
    const headersPlay = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10)",
        "Referer": "https://www.kuwo.cn/"
    };

    const qualities = [];
    for (const [qualityName, bitrate, formatType] of qualityList) {
        const apiUrl = `${nmobiHost}/mobi.s?f=web&user=0&source=kwplayer_ar_4.4.2.7_B_nuoweida_vh.apk&type=convert_url_with_sign&rid=${rid}&bitrate=${bitrate}&format=${formatType}`;
        try {
            const data = await getJson(apiUrl, headersPlay, 5000);
            if (data && Number(data.code) === 200 && data.data && data.data.url) {
                qualities.push([qualityName, data.data.url]);
            }
        } catch (e) {
            continue;
        }
    }

    if (!qualities.length) {
        return JSON.stringify({ parse: 0, playUrl: "", url: "", header: {} });
    }

    const urls = [];
    for (const [qName, qUrl] of qualities) {
        urls.push(qName);
        urls.push(qUrl);
    }

    // 歌词
    let lrc = "";
    try {
        const lrcUrl = `${lyricHost}/openapi/v1/www/lyric/getlyric?musicId=${rid}`;
        const lj = await getJson(lrcUrl, {}, 5000);
        if (lj && lj.data && lj.data.lrclist) {
            lrc = lj.data.lrclist.map(item =>
                `[${_format_time(parseFloat(item.time || 0))}]${item.lineLyric || ""}`
            ).join("\n");
        }
    } catch (e) {}

    // 封面（纯文本接口）
    let pic = "";
    const picUrl = `${picServerHost}/pic.web?type=rid_pic&pictype=url&size=500&rid=${rid}`;
    try {
        const picText = String(await getText(picUrl, {}, 5000) || "").trim();
        pic = picText.startsWith("http") ? picText : picUrl;
    } catch (e) {
        pic = picUrl;
    }

    const result = {
        parse: 0,
        playUrl: "",
        url: urls,
        header: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.kuwo.cn/"
        }
    };
    if (pic) result.pic = pic;

    // SSA 字幕
    if (lrc) {
       try {
        const ssaText = _create_ssa_subtitle(lrc);
        console.log("ssaText 长度:", ssaText.length);
        if (ssaText) {
            const ssaBase64 = base64Encode(ssaText);
            console.log("base64 长度:", ssaBase64.length);
            result.subs = [{
                name: "3行歌词",
                url: `data:text/x-ssa;base64,${ssaBase64}`,
                format: "text/x-ssa",
                flag: 0,
                selected: true
            }];
        }
    } catch (e) {
        console.log("字幕生成异常:", e.message);
    }
}
    return JSON.stringify(result);
}

async function search(wd, _, pg = "1") {
    const headersSearch = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "http://www.kuwo.cn/"
    };
    const pageNum = (parseInt(pg, 10) - 1) * 30;
    const url = `${searchHost}/r.s?client=kt&pn=${pageNum}&rn=30&all=${quote(wd)}&vipver=1&ft=artist&encoding=utf8&rformat=json&mobi=1`;
    let list = [];
    try {
        const data = await getJson(url, headersSearch, 10000);
        if (data && data.abslist) {
            const basePicPath = data.BASEPICPATH || "http://img1.kuwo.cn/star/starheads/";
            for (const item of data.abslist) {
                const aid = item.ARTISTID || item.DC_TARGETID || "";
                const pic = item.hts_PICPATH || (item.PICPATH ? basePicPath + item.PICPATH : "");
                list.push({
                    vod_id: String(aid),
                    vod_name: item.ARTIST || "",
                    vod_pic: toHttps(pic),
                    vod_remarks: `歌曲 : ${item.SONGNUM || 0}首`
                });
            }
        }
    } catch (e) {
        list = [];
    }
    return JSON.stringify({
        list,
        page: Number(pg),
        pagecount: 9999,
        limit: 30,
        total: 999999
    });
}

// ========== 固定导出入口 ==========
export function __jsEvalReturn() {
    return { init, home, homeVod, category, detail, play, proxy: null, search };
}