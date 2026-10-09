/*
title: '星辰影院', author: '小可乐/v6.1.1'
说明：可以不写ext，也可以写ext，ext支持的参数和格式参数如下
"ext": {
    "host": "xxxx", //站点网址
    "timeout": 6000,  //请求超时，单位毫秒
    "catesSet": "电视剧&电影&综艺",  //指定分类和顺序
    "tabsSet": "土星&下载线1"  //指定线路和顺序
}
*/


const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36';
const DefHeader = {
    'User-Agent': MOBILE_UA,
    'Referer': 'https://www.xcyycn.cc/'
};
var HOST;
var KParams = {
    headers: {'User-Agent': MOBILE_UA},
    timeout: 9000
};

async function init(cfg) {
    try {
        HOST = (cfg.ext?.host?.trim() || 'https://www.xcyycn.cc').replace(/\/$/, '');
        KParams.headers['Referer'] = HOST;
        let parseTimeout = parseInt(cfg.ext?.timeout?.trim(), 10);
        if (parseTimeout > 0) { KParams.timeout = parseTimeout; }
        KParams.catesSet = cfg.ext?.catesSet?.trim() || '';
        KParams.tabsSet = cfg.ext?.tabsSet?.trim() || '';
        KParams.resHtml = await request(HOST + '/');
    } catch (e) {
        console.error('初始化参数失败：', e.message);
    }
}

async function home(filter) {
    try {
        let resHtml = KParams.resHtml;
        if (!resHtml) { throw new Error('源码为空'); }
        let classes = [];
        let seen = new Set();
        let re = /<a\s+href="\/v\/(\d+)\.html"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = re.exec(resHtml)) !== null) {
            let cId = m[1];
            let cName = m[2].replace(/<[^>]+>/g, '').trim();
            if (!cName) continue;
            if (cName === '首页' || cName === '更多') continue;
            if (!seen.has(cId)) {
                seen.add(cId);
                classes.push({ type_name: cName, type_id: cId });
            }
        }
        if (KParams.catesSet) { classes = ctSet(classes, KParams.catesSet); }
        console.log(`📂 分类: ${JSON.stringify(classes)}`);
        return JSON.stringify({ class: classes, filters: {} });
    } catch (e) {
        console.error('获取分类失败：', e.message);
        return JSON.stringify({ class: [], filters: {} });
    }
}

async function homeVod() {
    try {
        let resHtml = KParams.resHtml;
        let VODS = getVodList(resHtml);
        return JSON.stringify({ list: VODS });
    } catch (e) {
        console.error('推荐页获取失败：', e.message);
        return JSON.stringify({ list: [] });
    }
}

async function category(tid, pg, filter, extend) {
    try {
        pg = parseInt(pg, 10); pg = pg > 0 ? pg : 1;
        let cateUrl = `${HOST}/v/${tid}-${pg}.html`;
        let resHtml = await request(cateUrl);
        if (!resHtml || resHtml.length < 1000) {
            resHtml = await request(`${HOST}/v/${tid}.html?page=${pg}`);
        }
        let VODS = getVodList(resHtml);
        let limit = VODS.length || 30;
        let pagecount = cutStr(resHtml, 'hl-page-total£/', '页', '1');
        pagecount = Number(pagecount) || 999;
        return JSON.stringify({ list: VODS, page: pg, pagecount: pagecount, limit: limit, total: limit * pagecount });
    } catch (e) {
        console.error('类别页获取失败：', e.message);
        return JSON.stringify({ list: [], page: 1, pagecount: 0, limit: 30, total: 0 });
    }
}

async function search(wd, quick, pg) {
    try {
        pg = parseInt(pg, 10); pg = pg > 0 ? pg : 1;
        let searchUrl = `${HOST}/s.html?wd=${encodeURIComponent(wd)}&page=${pg}`;
        let resHtml = await request(searchUrl);
        if (!resHtml || !resHtml.includes('/d-')) {
            resHtml = await request(`${HOST}/search/${encodeURIComponent(wd)}.html`);
        }
        let VODS = getVodList(resHtml);
        let limit = VODS.length || 30;
        let pagecount = cutStr(resHtml, 'hl-page-total£/', '页', String(Math.max(1, Math.ceil(VODS.length / 30))));
        pagecount = Number(pagecount) || Math.max(1, Math.ceil(VODS.length / 30));
        return JSON.stringify({ list: VODS, page: pg, pagecount: pagecount, limit: limit, total: limit * pagecount });
    } catch (e) {
        console.error('搜索页获取失败：', e.message);
        return JSON.stringify({ list: [], page: 1, pagecount: 0, limit: 30, total: 0 });
    }
}

function getVodList(khtml) {
    try {
        if (!khtml || khtml.length < 500) { throw new Error('源码为空'); }
        let kvods = [], seen = new Set();
        // 按卡片块切分
        let blocks = khtml.split(/<(?:div|li)\s+class="(?:public-list-box|search-box|slide-time-bj|public-list-bj)/g);
        for (let blk of blocks) {
            if (blk.length < 100) continue;
            let m = blk.match(/href="\/d[-/](\d+)\.html"/);
            if (!m) continue;
            let kid = m[1];
            // 片名
            let kname = cutStr(blk, 'slide-info-title£>', '<', '')
                || cutStr(blk, 'public-list-exp-info-tit-name£>', '<', '')
                || cutStr(blk, 'public-list-exp-info-tit-link£>', '<', '')
                || cutStr(blk, 'thumb-txt£>', '<', '')
                || cutStr(blk, 'alt="', '"', '')
                || cutStr(blk, 'title="', '"', '');
            kname = kname.replace(/&amp;/g, '&');
            if (!kname || seen.has(kname)) continue;
            if (kname.length < 2) continue;
            if (/^(19|20)\d{2}$/.test(kname)) continue;
            if (/^(电影|电视剧|综艺|动漫|短剧|热映推荐|更新至|排序|更多|首页|排行榜|搜索|详情|简介|第\d+集|全\d+集|动作片|喜剧片|科幻片|恐怖片)$/.test(kname)) continue;
            seen.add(kname);
            // 图片：data-src 优先
            let kpic = cutStr(blk, 'data-src="', '"', '')
                || cutStr(blk, "background-image: url('", "'", '')
                || cutStr(blk, 'background-image: url("', '"', '')
                || cutStr(blk, 'background-image: url(', ')', '')
                || cutStr(blk, 'src="', '"', '');
            kpic = kpic.replace(/&amp;/g, '&');
            if (kpic.startsWith('//')) kpic = 'https:' + kpic;
            else if (kpic.startsWith('/')) kpic = HOST + kpic;
            // 状态
            let kremarks = '';
            let rm = cutStr(blk, 'slide-info-remarks">', '</span>', '', false, 0, true);
            for (let r of rm) {
                r = r.trim();
                if (r && !/^(19|20)\d{2}$/.test(r)) { kremarks = r; break; }
            }
            if (!kremarks) kremarks = cutStr(blk, 'public-list-exp-info-tit-remarks£>', '<', '');
            if (!kremarks) kremarks = cutStr(blk, 'public-list-prb£>', '<', '');
            kvods.push({ vod_name: kname, vod_pic: kpic, vod_remarks: kremarks,
                         vod_id: `/d-${kid}.html@${kname}@${kpic}@${kremarks}` });
        }
        return kvods;
    } catch (e) {
        console.error('生成视频列表失败：', e.message);
        return [];
    }
}

async function detail(ids) {
    try {
        let parts0 = ids.split('@');
        let id = parts0[0], kname = parts0[1] || '', kpic = parts0[2] || '', kremarks = parts0[3] || '';
        let detailUrl = !/^http/.test(id) ? `${HOST}${id}` : id;
        let resHtml = await request(detailUrl);
        if (!resHtml) { throw new Error('源码为空'); }

        let introHtml = cutStr(resHtml, 'slide-info', '</div>', '', false, 0, true).join(' ');

        // 线路名
        let tabHtml = cutStr(resHtml, 'anthology-tab', '</div>', '', false);
        let lineNames = cutStr(tabHtml, '<a class="swiper-slide', '</a>', '', false, 0, true)
            .map(it => cutStr(it, '£&nbsp;', '<span', '').trim())
            .filter(n => n && n !== '第' && !/^\d+$/.test(n));

        let ktabs = [], kurls = [];

        if (lineNames.length) {
            let boxStarts = [];
            let boxRe = /<div class="anthology-list-box/g;
            let m;
            while ((m = boxRe.exec(resHtml)) !== null) boxStarts.push(m.index);
            if (boxStarts.length < 2) {
                let boxRe2 = /<div[^>]*class="[^"]*\banthology-list-box\b/g;
                boxStarts = [];
                while ((m = boxRe2.exec(resHtml)) !== null) boxStarts.push(m.index);
            }
            let endAnchor = resHtml.length;
            let tail = resHtml.slice(Math.max(0, (boxStarts[boxStarts.length - 1] || 0) - 200));
            let mm = tail.match(/(相关影片|相关明星|猜你喜欢|热映推荐|排行榜|分类)/);
            if (mm && boxStarts.length) endAnchor = boxStarts[boxStarts.length - 1] - 200 + mm.index;

            let boxes = [];
            for (let i = 0; i < boxStarts.length; i++) {
                let s = boxStarts[i];
                let e = (i + 1 < boxStarts.length) ? boxStarts[i + 1] : endAnchor;
                boxes.push(resHtml.slice(s, e));
            }
            let groups = {};
            lineNames.forEach(ln => groups[ln] = []);
            boxes.forEach((box, idx) => {
                if (idx >= lineNames.length) return;
                // —— 关键修正：取整个 href，集数取最后一段 ——
                let hrefArr = cutStr(box, 'href="', '"', '', false, 0, true)
                    .filter(h => /^\/p\/\d+-\d+-\d+\.html$/.test(h));
                hrefArr.forEach(hr => {
                    // hr = /p/175930-5-1.html  → 集数 = 最后一段 1
                    let segs = hr.replace(/\.html$/, '').split('-');
                    let epNum = parseInt(segs[segs.length - 1], 10);
                    if (epNum > 0) groups[lineNames[idx]].push(`第${epNum}集$${HOST}${hr}`);
                });
            });
            ktabs = lineNames;
            kurls = ktabs.map(ln => groups[ln].join('#'));
        } else {
            console.log(`⚠️ ${kname} 无多线路，降级`);
            let pLinks = cutStr(resHtml, 'href="', '"', '', false, 0, true)
                .filter(h => /^\/p\/\d+-\d+-\d+\.html$/.test(h));
            let eps = pLinks.map(hr => {
                let segs = hr.replace(/\.html$/, '').split('-');
                let epNum = parseInt(segs[segs.length - 1], 10);
                return epNum > 0 ? `第${epNum}集$${HOST}${hr}` : '';
            }).filter(Boolean);
            if (eps.length) { ktabs = ['默认']; kurls = [eps.join('#')]; }
            else { ktabs = ['默认']; kurls = [detailUrl]; }
        }

        // 线路过滤
        if (KParams.tabsSet) {
            let ktus = ktabs.map((it, idx) => ({ type_name: it, type_value: kurls[idx] }));
            ktus = ctSet(ktus, KParams.tabsSet);
            ktabs = ktus.map(it => it.type_name);
            kurls = ktus.map(it => it.type_value);
        }

        let kt = ktabs.join('$$$');
        let ku = kurls.join('$$$');
        console.log(`✅ ${kname} | ${ktabs.length}线路 | ${kurls.reduce((a, b) => a + b.split('#').length, 0)}集`);
        console.log(`   线路: ${kt}`);

        let VOD = {
            vod_id: detailUrl,
            vod_name: kname || cutStr(resHtml, '<title>', '</title>', '未知').replace(/&nbsp;/g, ' '),
            vod_pic: kpic,
            vod_remarks: kremarks || cutStr(introHtml, 'slide-info-remarks">', '<', '状态'),
            type_name: cutStr(introHtml, '类型£<a', '</a>', '类型').replace(/.*£/g, ''),
            vod_year: (cutStr(introHtml, '2026', '<', '2026').match(/\d{4}/) || ['2026'])[0],
            vod_area: cutStr(introHtml, '地区£', '<', '大陆').replace(/.*£/g, ''),
            vod_lang: cutStr(introHtml, '语言£', '<', '国语').replace(/.*£/g, ''),
            vod_director: cutStr(introHtml, '导演', '</div>', '').replace(/<[^>]+>/g, ' ').replace(/£/g, '').trim(),
            vod_actor: cutStr(introHtml, '演员', '</div>', kname).replace(/<[^>]+>/g, ' ').replace(/£/g, '').trim(),
            vod_content: cutStr(resHtml, 'id="height_limit"', '</div>', kname),
            vod_play_from: kt,
            vod_play_url: ku
        };
        return JSON.stringify({ list: [VOD] });
    } catch (e) {
        console.error('详情页获取失败：', e.message);
        return JSON.stringify({ list: [] });
    }
}
async function play(flag, ids, flags) {
    try {
        let kp = 0, kurl = '';
        if (/下载/.test(flag)) {
            kurl = ids;
        } else {
            let resHtml = await request(ids);
            let playerBlock = cutStr(resHtml, 'var player_', '};', '', false);
            kurl = cutStr(playerBlock, '"url": "', '"', '').replace(/\\"/g, '').replace(/\\\//g, '/');
            if (!kurl || !kurl.endsWith('.m3u8')) {
                let m = resHtml.match(/https?:[^\s"']+\.m3u8/);
                kurl = m ? m[0] : '';
            }
            if (!/^http/.test(kurl)) {
                kurl = ids;
                kp = 1;
            }
        }
        return JSON.stringify({ jx: 0, parse: kp, url: kurl, header: DefHeader });
    } catch (e) {
        console.error('播放失败：', e.message);
        return JSON.stringify({ jx: 0, parse: 0, url: '', header: {} });
    }
}

function ctSet(kArr, setStr) {
    try {
        if (!Array.isArray(kArr) || kArr.length === 0 || typeof setStr !== 'string' || !setStr) { throw new Error('第一参数需为非空数组，第二参数需为非空字符串'); }
        const set_arr = [...kArr];
        const arrNames = setStr.split('&');
        const filtered_arr = arrNames.map(item => set_arr.find(it => it.type_name === item)).filter(Boolean);
        return filtered_arr.length ? filtered_arr : [set_arr[0]];
    } catch (e) {
        console.error('ctSet 执行异常：', e.message);
        return kArr;
    }
}

function safeParseJSON(jStr) {
    try { return JSON.parse(jStr); } catch (e) { return null; }
}

function cutStr(str, prefix = '', suffix = '', defVal = '', clean = true, i = 0, all = false) {
    try {
        if (typeof str !== 'string') { throw new Error('被截取对象必须为字符串'); }
        const cleanStr = cs => String(cs).replace(/<[^>]*?>/g, ' ').replace(/(&nbsp;|[\u0020\u00A0\u3000\s])+/g, ' ').trim().replace(/\s+/g, ' ');
        const esc = s => String(s).replace(/[.*+?${}()|[\]\\/^]/g, '\\$&');
        let pre = esc(prefix).replace(/£/g, '[^]*?'), end = esc(suffix);
        const regex = new RegExp(`${pre || '^'}([^]*?)${end || '$'}`, 'g');
        const matchIter = str.matchAll(regex);
        if (all) {
            let matchArr = [...matchIter];
            if (!matchArr.length) { return [defVal]; }
            return matchArr.map(ela => ela[1] !== undefined ? (clean ? cleanStr(ela[1]) : ela[1]) : defVal);
        }
        const idx = parseInt(i, 10);
        if (isNaN(idx)) { throw new Error('序号必须为整数'); }
        let tgResult, matchIdx = 0;
        if (idx >= 0) {
            for (let elt of matchIter) {
                if (matchIdx++ === idx) { tgResult = elt[1]; break; }
            }
        } else {
            let absI = Math.abs(idx), ringBuf = new Array(absI), ringPtr = 0, ringCnt = 0;
            for (let elt of matchIter) {
                ringBuf[ringPtr] = elt[1];
                ringPtr = (ringPtr + 1) % absI;
                ringCnt = Math.min(ringCnt + 1, absI);
                matchIdx++;
            }
            tgResult = (matchIdx >= absI && ringCnt > 0) ? ringBuf[ringPtr % ringCnt] : undefined;
        }
        return tgResult !== undefined ? (clean ? (cleanStr(tgResult) || defVal) : tgResult) : defVal;
    } catch (e) {
        console.error('字符串截取错误：', e.message);
        return all ? ['cutStrErr'] : 'cutStrErr';
    }
}

async function request(reqUrl, options = {}) {
    try {
        if (typeof reqUrl !== 'string' || !reqUrl.trim()) { throw new Error('reqUrl需为字符串且非空'); }
        if (typeof options !== 'object' || Array.isArray(options) || options === null) { throw new Error('options类型需为非null对象'); }
        options.method = options.method?.toUpperCase() || 'GET';
        if (['GET', 'HEAD'].includes(options.method)) {
            delete options.body;
            delete options.data;
            delete options.postType;
        }
        let { headers, timeout, ...restOpts } = options;
        const optObj = {
            headers: (typeof headers === 'object' && !Array.isArray(headers) && headers) ? headers : KParams.headers,
            timeout: parseInt(timeout, 10) > 0 ? parseInt(timeout, 10) : KParams.timeout,
            ...restOpts
        };
        const res = await req(reqUrl, optObj);
        if (options.withHeaders) {
            const resHeaders = typeof res.headers === 'object' && !Array.isArray(res.headers) && res.headers ? res.headers : {};
            const resWithHeaders = { ...resHeaders, body: res?.content ?? '' };
            return JSON.stringify(resWithHeaders);
        }
        return res?.content ?? '';
    } catch (e) {
        console.error(`${reqUrl}→请求失败：`, e.message);
        return options?.withHeaders ? JSON.stringify({ body: '' }) : '';
    }
}

export function __jsEvalReturn() {
    return {
        init,
        home,
        homeVod,
        category,
        search,
        detail,
        play,
        proxy: null
    };
}