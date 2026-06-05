import React, { useState, useEffect, useRef } from 'react';

// ==================== CONFIG ====================
const apiKey = "20cbd64e90926ce0eefd4b1e9127059d35058c253fb15a1a6b9b66efe131b5c0";
const targetLeagueIds = [153, 168, 55, 653, 356];
const targetCountryIds = [44, 3, 18, 114, 133];

// ==================== UTILITIES ====================
const formatForApi = (d) => d.toISOString().split("T")[0];
const getShortDay = (d) => d.toLocaleDateString('en-US', { weekday: 'short' });
const getShortMonth = (d) => d.toLocaleDateString('en-US', { month: 'short' });
const isSameDate = (d1, d2) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

export default function App() {
  // ==================== STATES ====================
  const [currentView, setCurrentView] = useState('matches'); // matches, live, detail
  const [previousView, setPreviousView] = useState('matches');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [cachedLeagues, setCachedLeagues] = useState(null);
  
  // Data States
  const [matchesResults, setMatchesResults] = useState([]);
  const [liveResults, setLiveResults] = useState([]);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [h2hData, setH2hData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [lineupData, setLineupData] = useState(null);

  // UI/Loading States
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [showLiveDot, setShowLiveDot] = useState(false);

  const dateSliderRef = useRef(null);

  // ==================== API FETCHERS ====================
  const getSelectedLeagues = async () => {
    if (cachedLeagues) return cachedLeagues;
    let all = [];
    for (const cid of targetCountryIds) {
      try {
        const res = await fetch(`https://apiv3.apifootball.com/?action=get_leagues&country_id=${cid}&APIkey=${apiKey}`);
        const data = await res.json();
        if (Array.isArray(data)) all.push(...data);
      } catch (e) { console.error(e); }
    }
    const filtered = all
      .filter(l => targetLeagueIds.includes(parseInt(l.league_id)))
      .map(l => ({ id: parseInt(l.league_id), name: l.league_name, logo: l.league_logo, country: l.country_name }));
    setCachedLeagues(filtered);
    return filtered;
  };

  const loadMatchesData = async (targetDate, isSilent = false) => {
    if (!isSilent) setMatchesLoading(true);
    const leagues = await getSelectedLeagues();
    const results = await Promise.all(leagues.map(async (league) => {
      try {
        const d = new Date(targetDate);
        const prev = new Date(d); prev.setDate(prev.getDate() - 1);
        const next = new Date(d); next.setDate(next.getDate() + 1);
        const res = await fetch(
          `https://apiv3.apifootball.com/?action=get_events&from=${formatForApi(prev)}&to=${formatForApi(next)}&league_id=${league.id}&timezone=Asia/Jakarta&APIkey=${apiKey}`
        );
        const data = await res.json();
        const matches = Array.isArray(data) && !data.error
          ? data.filter(m => m.match_date === targetDate).sort((a, b) => (a.match_time || "").localeCompare(b.match_time || ""))
          : [];
        return { league, matches };
      } catch { return { league, matches: [] }; }
    }));
    setMatchesResults(results);
    setMatchesLoading(false);
  };

  const loadLiveData = async (isSilent = false) => {
    if (!isSilent) setLiveLoading(true);
    const leagues = await getSelectedLeagues();
    const results = await Promise.all(leagues.map(async (league) => {
      try {
        const res = await fetch(
          `https://apiv3.apifootball.com/?action=get_events&league_id=${league.id}&match_live=1&timezone=Asia/Jakarta&APIkey=${apiKey}`
        );
        const data = await res.json();
        const matches = Array.isArray(data) && !data.error
          ? data.filter(m => {
              const s = (m.match_status || "").trim().toLowerCase();
              return !["finished", "ft", "aet", "ap", "pen.", "after pen.", "cancelled", "postponed", "canc", "postp"].includes(s) && !s.includes("finish");
            }).sort((a, b) => (a.match_time || "").localeCompare(b.match_time || ""))
          : [];
        return { league, matches };
      } catch { return { league, matches: [] }; }
    }));

    const totalLive = results.reduce((sum, r) => sum + r.matches.length, 0);
    setShowLiveDot(totalLive > 0);
    setLiveResults(results);
    setLiveLoading(false);
  };

  const openDetail = async (matchId, matchHomeId, matchAwayId) => {
    setPreviousView(currentView);
    setCurrentView('detail');
    setDetailLoading(true);
    setDetailTab('overview');
    setCurrentMatch(null);
    setH2hData(null);
    setStatsData(null);
    setLineupData(null);

    try {
      const res = await fetch(`https://apiv3.apifootball.com/?action=get_events&match_id=${matchId}&APIkey=${apiKey}`);
      const data = await res.json();
      const match = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (!match) {
        setDetailLoading(false);
        return;
      }
      setCurrentMatch(match);

      const [linRes, h2hRes, stRes] = await Promise.all([
        fetch(`https://apiv3.apifootball.com/?action=get_lineups&match_id=${matchId}&APIkey=${apiKey}`),
        fetch(`https://apiv3.apifootball.com/?action=get_H2H&firstTeamId=${matchHomeId}&secondTeamId=${matchAwayId}&APIkey=${apiKey}`),
        fetch(`https://apiv3.apifootball.com/?action=get_statistics&match_id=${matchId}&APIkey=${apiKey}`)
      ]);

      const [linData, h2hRaw, stRaw] = await Promise.all([linRes.json(), h2hRes.json(), stRes.json()]);
      
      setLineupData(linData[matchId.toString()] || linData);
      setH2hData(h2hRaw);
      setStatsData(stRaw[matchId.toString()] || stRaw);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  // ==================== EFFECTS / TIMERS ====================
  useEffect(() => {
    if (currentView === 'matches') {
      loadMatchesData(formatForApi(selectedDate), false);
      let timer;
      if (isSameDate(selectedDate, new Date())) {
        timer = setInterval(() => loadMatchesData(formatForApi(selectedDate), true), 60000);
      }
      return () => {
        if (timer) clearInterval(timer);
      }; 
    }
  }, [selectedDate, currentView]);

  useEffect(() => {
    if (currentView === 'live') {
      loadLiveData(false);
      const timer = setInterval(() => loadLiveData(true), 60000);
      return () => clearInterval(timer);
    }
  }, [currentView]);

  // Background check live dot on init
  useEffect(() => {
    const checkLiveStatus = async () => {
      const leagues = await getSelectedLeagues();
      let cnt = 0;
      for (const l of leagues) {
        try {
          const r = await fetch(`https://apiv3.apifootball.com/?action=get_events&league_id=${l.id}&match_live=1&timezone=Asia/Jakarta&APIkey=${apiKey}`);
          const d = await r.json();
          if (Array.isArray(d)) cnt += d.filter(m => {
            const s = (m.match_status||"").toLowerCase();
            return !["finished","ft","aet","ap","pen.","after pen.","cancelled","postponed","canc","postp"].includes(s) && !s.includes("finish");
          }).length;
        } catch {}
      }
      if (cnt > 0) setShowLiveDot(true);
    };
    checkLiveStatus();
  }, []);

  // Center selected date on slider
  useEffect(() => {
    if (currentView === 'matches' && dateSliderRef.current) {
      const selectedEl = dateSliderRef.current.querySelector('.bg-active-date');
      if (selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [selectedDate, currentView]);

  // ==================== HTML RENDER HELPERS ====================
  const renderMatchStatus = (match) => {
    const statusRaw = (match.match_status || "").trim();
    const statusLower = statusRaw.toLowerCase();
    const isFinished = ["finished","ft","aet","ap","pen.","after pen."].includes(statusLower) || statusLower.includes("finish") || statusLower === "ft";
    const isLive = match.match_live === "1" || ["1h","2h","ht","et","p","pen","break"].includes(statusLower) || (statusLower !== "" && !isNaN(statusLower) && !isFinished);

    if (isFinished || isLive) {
      return (
        <div class="flex flex-col items-center justify-center">
          <div class={`text-[18px] font-black ${isLive ? 'text-red-500' : 'text-black'}`}>
            {match.match_hometeam_score ?? 0} - {match.match_awayteam_score ?? 0}
          </div>
          <div class="text-[10px] uppercase font-bold text-red-500 mt-0.5">
            {isLive ? `${statusRaw}${isNaN(statusRaw) ? '' : "'"}` : "FULL-TIME"}
          </div>
        </div>
      );
    }
    return (
      <div class="flex flex-col items-center justify-center">
        <div class="text-[18px] font-black text-black">
          {match.match_time ? match.match_time.substring(0, 5) : '00:00'}
        </div>
        <div class="text-[10px] text-gray-400 font-medium mt-0.5">WIB</div>
      </div>
    );
  };

  const renderMatchCard = (match) => (
    <div key={match.match_id} onClick={() => openDetail(match.match_id, match.match_hometeam_id, match.match_awayteam_id)}
      class="flex items-center justify-between p-4 border-b-2 border-gray-100 last:border-0 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer">
      <div class="flex items-center gap-3 w-[40%]">
        <img src={match.team_home_badge || 'https://placehold.co/24'} class="w-7 h-7 object-contain shrink-0" onError={(e)=>{e.target.src='https://placehold.co/24'}} />
        <span class="text-[14px] font-bold truncate">{match.match_hometeam_name}</span>
      </div>
      <div class="w-[20%] flex justify-center">{renderMatchStatus(match)}</div>
      <div class="flex items-center gap-3 w-[40%] justify-end text-right">
        <span class="text-[14px] font-bold truncate">{match.match_awayteam_name}</span>
        <img src={match.team_away_badge || 'https://placehold.co/24'} class="w-7 h-7 object-contain shrink-0" onError={(e)=>{e.target.src='https://placehold.co/24'}} />
      </div>
    </div>
  );

  const renderLeagueBlock = (league, matches, extraCardClass = '') => {
    if (!matches.length) return null;
    return (
      <div key={league.id} class={`mb-4 bg-white rounded-xl shadow-sm overflow-hidden ${extraCardClass}`}>
        <div class="flex items-center gap-3 py-5 px-3 bg-white border-b-2 border-gray-100">
          <img src={league.logo || 'https://placehold.co/40'} class="w-10 h-10 object-contain" alt="" />
          <div>
            <h2 class="text-[14px] font-bold leading-tight">{league.name}</h2>
            <p class="text-[11px] text-gray-500 font-normal mt-0.5">{league.country || 'International'}</p>
          </div>
        </div>
        <div class="px-2">{matches.map(renderMatchCard)}</div>
      </div>
    );
  };

  // Dynamic Date Slider array configuration (-15 to +15 days)
  const renderDates = () => {
    const sliderButtons = [];
    const today = new Date();
    for (let i = -15; i <= 15; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const isToday = isSameDate(d, today);
      const isSel = isSameDate(d, selectedDate);
      const dayName = isToday ? "Today" : getShortDay(d);
      const dateText = `${d.getDate()} ${getShortMonth(d)}`;

      sliderButtons.push(
        <button key={i} onClick={() => setSelectedDate(d)}
          class={`flex flex-col items-center justify-center min-w-[70px] px-2 py-1.5 rounded-xl cursor-pointer transition-colors ${isSel ? "bg-[#1C1D5F] bg-active-date" : "bg-transparent hover:bg-gray-100"}`}>
          <span class={`text-[13px] font-bold ${isSel ? "text-white" : "text-gray-500"}`}>{dayName}</span>
          <span class={`text-[11px] font-medium ${isSel ? "text-gray-300" : "text-gray-400"} mt-0.5`}>{dateText}</span>
        </button>
      );
    }
    return sliderButtons;
  };

  // ==================== CONDITIONAL VIEW LOGIC ====================
  const totalMatchesCount = matchesResults.reduce((sum, r) => sum + (r.matches?.length || 0), 0);
  const totalLiveMatchesCount = liveResults.reduce((sum, r) => sum + (r.matches?.length || 0), 0);

  // Timeline handler for details
  let homeScorers = [], awayScorers = [], allEvents = [];
  if (currentMatch) {
    if (Array.isArray(currentMatch.goalscorer)) {
      currentMatch.goalscorer.forEach(g => {
        allEvents.push({ ...g, type: 'goal', minute: parseInt(g.time) || 0 });
        if (g.home_scorer) homeScorers.push(`${g.home_scorer} (${g.time}')`);
        if (g.away_scorer) awayScorers.push(`(${g.time}') ${g.away_scorer}`);
      });
    }
    if (Array.isArray(currentMatch.cards)) {
      currentMatch.cards.forEach(c => allEvents.push({ ...c, type: 'card', minute: parseInt(c.time) || 0 }));
    }
    allEvents.sort((a, b) => a.minute - b.minute);
  }

  // Head to Head aggregation logic
  let h2hHomeWins = 0, h2hAwayWins = 0, h2hDraws = 0;
  const h2hMatchesList = h2hData?.firstTeam_VS_secondTeam || [];
  if (h2hMatchesList.length && currentMatch) {
    h2hMatchesList.forEach(m => {
      const h = parseInt(m.match_hometeam_score), a = parseInt(m.match_awayteam_score);
      if (h === a) h2hDraws++;
      else {
        const winner = h > a ? m.match_hometeam_name : m.match_awayteam_name;
        if (winner === currentMatch.match_hometeam_name) h2hHomeWins++;
        else h2hAwayWins++;
      }
    });
  }

  return (
    <>
      {/* VIEW: MATCHES */}
      {currentView === 'matches' && (
        <div id="view-matches" class="block">
          <header class="sticky top-0 z-40 backdrop-blur-md pb-2 bg-white/90">
            <div class="max-w-3xl mx-auto flex items-center justify-center">
              <div class="bg-[url('https://raw.githubusercontent.com/galangMaulana01/bolaindo/main/benner.png')] bg-cover bg-center w-full aspect-[430/120] flex items-center justify-center mb-4">
                <p class="text-4xl font-black text-white drop-shadow-md">Pertandingan</p>
              </div>
            </div>
            <div class="relative max-w-2xl mx-auto flex items-center">
              <div ref={dateSliderRef} id="date-slider" class="flex items-center gap-2 overflow-x-auto no-scrollbar px-2 w-full pb-1 scroll-smooth">
                {renderDates()}
              </div>
            </div>
          </header>

          <main class="max-w-2xl mx-auto p-4 mt-2">
            {matchesLoading && (
              <div class="text-center py-12">
                <div class="w-8 h-8 border-4 border-gray-300 border-t-[#1C1D5F] rounded-full animate-spin mx-auto mb-4"></div>
                <p class="text-sm text-gray-500">Memuat jadwal pertandingan...</p>
              </div>
            )}
            {!matchesLoading && totalMatchesCount > 0 && (
              <div class="space-y-5">{matchesResults.map(r => renderLeagueBlock(r.league, r.matches))}</div>
            )}
            {!matchesLoading && totalMatchesCount === 0 && (
              <div class="text-center py-16 text-gray-400">
                <div class="text-4xl mb-3 opacity-50">⚽</div>
                <p>Tidak ada pertandingan di tanggal ini.</p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* VIEW: LIVE */}
      {currentView === 'live' && (
        <div id="view-live" class="block">
          <header class="sticky top-0 z-40 backdrop-blur-md pb-4">
            <div class="max-w-3xl mx-auto flex items-center justify-center">
              <div class="bg-[url('https://raw.githubusercontent.com/galangMaulana01/bolaindo/main/benner.png')] bg-cover bg-center w-full aspect-[430/120] flex items-center justify-center mb-4">
                <p class="text-4xl font-black text-white drop-shadow-md">Berlangsung</p>
              </div>
            </div>
          </header>

          <main class="max-w-2xl mx-auto p-4 mt-2">
            {liveLoading && (
              <div class="text-center py-12">
                <div class="w-8 h-8 border-4 border-gray-300 border-t-red-500 rounded-full animate-spin mx-auto mb-4"></div>
                <p class="text-sm text-gray-500">Memeriksa pertandingan live...</p>
              </div>
            )}
            {!liveLoading && totalLiveMatchesCount > 0 && (
              <div class="space-y-5">{liveResults.map(r => renderLeagueBlock(r.league, r.matches, 'border-2 border-gray-100'))}</div>
            )}
            {!liveLoading && totalLiveMatchesCount === 0 && (
              <div class="text-center py-16 text-gray-400">
                <div class="text-4xl mb-3 opacity-50">📡</div>
                <p class="text-sm font-semibold">Saat ini tidak ada pertandingan live.</p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* VIEW: MATCH DETAIL */}
      {currentView === 'detail' && (
        <div id="view-detail" class="block animate-fade-in">
          <header class="bg-[url('https://raw.githubusercontent.com/galangMaulana01/bolaindo/main/benner.png')] bg-cover bg-center aspect-[430/120] pt-6 pb-6">
            <div class="max-w-3xl mx-auto px-4">
              <div class="flex items-center justify-between mb-4">
                <button onClick={() => setCurrentView(previousView === 'detail' ? 'matches' : previousView)} class="p-2 hover:bg-white/10 rounded-full transition active:scale-95">
                  <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>
                <span class="text-xs font-bold tracking-wider text-white/80 uppercase">
                  {currentMatch ? currentMatch.league_name : 'Match Detail'}
                </span>
                <div class="w-10"></div>
              </div>

              {detailLoading && <div class="text-center py-6 text-sm text-white/60">Memuat data pertandingan...</div>}
              
              {!detailLoading && currentMatch && (
                <div>
                  <div class="flex items-center justify-between px-4 py-4">
                    <div class="flex flex-col items-center text-center w-[35%]">
                      <div class="bg-white p-3 rounded-full mb-2 shadow-sm">
                        <img src={currentMatch.team_home_badge || "https://placehold.co/60"} class="w-14 h-14 object-contain" />
                      </div>
                      <span class="text-[14px] font-bold text-white line-clamp-2 leading-tight">{currentMatch.match_hometeam_name}</span>
                    </div>
                    <div class="text-center w-[30%]">
                      <div class="text-4xl font-black tracking-widest text-white drop-shadow-md">{currentMatch.match_hometeam_score} - {currentMatch.match_awayteam_score}</div>
                      <div class="text-[10px] font-bold text-white bg-white/20 px-3 py-1 rounded-full border border-white/30 inline-block mt-2 tracking-wide uppercase">
                        {currentMatch.match_status === "Finished" ? "Full-Time" : currentMatch.match_status}
                      </div>
                    </div>
                    <div class="flex flex-col items-center text-center w-[35%]">
                      <div class="bg-white p-3 rounded-full mb-2 shadow-sm">
                        <img src={currentMatch.team_away_badge || "https://placehold.co/60"} class="w-14 h-14 object-contain" />
                      </div>
                      <span class="text-[14px] font-bold text-white line-clamp-2 leading-tight">{currentMatch.match_awayteam_name}</span>
                    </div>
                  </div>

                  {(homeScorers.length > 0 || awayScorers.length > 0) && (
                    <div class="grid grid-cols-2 gap-4 mt-4 px-2 text-[12px] text-white/80 border-t border-white/10 pt-3">
                      <div class="space-y-1 text-left font-medium">
                        {homeScorers.map((s, idx) => <div key={idx}>{s}</div>)}
                      </div>
                      <div class="space-y-1 text-right font-medium">
                        {awayScorers.map((s, idx) => <div key={idx}>{s}</div>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          <nav class="sticky top-0 bg-white/95 backdrop-blur-md border-b border-gray-200 z-50 shadow-sm mt-[-20px] pt-5">
            <div class="max-w-2xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
              {['overview', 'events', 'stats', 'lineup'].map((tab) => (
                <button key={tab} onClick={() => setDetailTab(tab)}
                  class={`shrink-0 px-5 py-2 rounded-full text-xs font-bold transition-all ${detailTab === tab ? "bg-[#1C1D5F] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </nav>

          <main class="max-w-2xl mx-auto p-4 space-y-4">
            {/* TAB CONTENT: OVERVIEW */}
            {detailTab === 'overview' && currentMatch && (
              <section class="space-y-4">
                <div class="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                  <h3 class="text-sm font-bold text-[#1C1D5F] mb-3 uppercase tracking-wider text-[11px]">Match Info</h3>
                  <div class="space-y-3 text-sm">
                    <div class="flex items-center gap-3 text-gray-600">
                      <span class="text-base shrink-0 bg-gray-50 p-1.5 rounded-lg border border-gray-100">🏆</span>
                      <div>
                        <p class="font-bold text-gray-900">{currentMatch.league_name}</p>
                        <p class="text-xs text-gray-500">{currentMatch.country_name || "International"}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-3 text-gray-600 border-t border-gray-100 pt-3">
                      <span class="text-base shrink-0 bg-gray-50 p-1.5 rounded-lg border border-gray-100">📅</span>
                      <div>
                        <p class="font-bold text-gray-900">{currentMatch.match_date}</p>
                        <p class="text-xs text-gray-500">{currentMatch.match_time} WIB</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* H2H Block Inside Overview */}
                <div class="space-y-3">
                  <h3 class="text-[11px] font-bold text-[#1C1D5F] uppercase tracking-wider px-1 mt-4 mb-2">Head to Heads</h3>
                  {!h2hMatchesList.length ? (
                    <div class="bg-white border border-gray-200 shadow-sm rounded-xl p-6 text-center flex flex-col justify-center items-center min-h-[120px]">
                      <h4 class="text-[14px] font-bold text-gray-800">First Encounter Ahead!</h4>
                      <p class="text-[12px] text-gray-500 mt-1">These teams haven't faced each other yet.</p>
                    </div>
                  ) : (
                    <div class="bg-white border border-gray-200 shadow-sm rounded-xl p-4 space-y-4">
                      <div class="grid grid-cols-3 text-center border-b border-gray-100 pb-3.5">
                        <div>
                          <div class="text-[13px] font-bold text-gray-800">{h2hHomeWins} Wins</div>
                          <div class="w-10 h-[4px] bg-[#1C1D5F] rounded-full mx-auto mt-1.5"></div>
                        </div>
                        <div>
                          <div class="text-[13px] font-bold text-gray-800">{h2hDraws} Draws</div>
                          <div class="w-10 h-[4px] bg-gray-300 rounded-full mx-auto mt-1.5"></div>
                        </div>
                        <div>
                          <div class="text-[13px] font-bold text-gray-800">{h2hAwayWins} Wins</div>
                          <div class="w-10 h-[4px] bg-red-500 rounded-full mx-auto mt-1.5"></div>
                        </div>
                      </div>
                      
                      {/* Simple H2H Row implementation */}
                      <div class="space-y-3">
                        {h2hMatchesList.slice(0, 5).map((m, idx) => (
                          <div key={idx} class="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[12px]">
                            <span class="text-gray-500">{m.match_date}</span>
                            <div class="flex items-center gap-2">
                              <span class="font-bold truncate max-w-[80px]">{m.match_hometeam_name}</span>
                              <span class="bg-white px-2 py-0.5 rounded border border-gray-200 font-black text-[#1C1D5F]">
                                {m.match_hometeam_score} - {m.match_awayteam_score}
                              </span>
                              <span class="font-bold truncate max-w-[80px]">{m.match_awayteam_name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TAB CONTENT: EVENTS / TIMELINE */}
            {detailTab === 'events' && (
              <section class="space-y-4">
                <div class="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                  <h3 class="text-sm font-bold text-[#1C1D5F] mb-4 uppercase tracking-wider text-[11px]">Match Timeline</h3>
                  {allEvents.length === 0 ? (
                    <p class="text-xs text-gray-400 py-2">Tidak ada log kronologi kejadian pertandingan.</p>
                  ) : (
                    <div class="relative border-l-2 border-gray-200 ml-4 pl-6 space-y-6">
                      {allEvents.map((ev, index) => {
                        const isHome = !!(ev.home_fault || ev.home_scorer);
                        let icon = "⚽", detail = "";
                        if (ev.type === 'goal') {
                          detail = `Gol!: ${ev.home_scorer || ev.away_scorer} ${ev.info ? `(${ev.info})` : ''}`;
                        } else if (ev.type === 'card') {
                          const isY = ev.card.toLowerCase().includes("yellow");
                          icon = isY ? "🟨" : "🟥";
                          detail = `Kartu ${isY ? 'Kuning' : 'Merah'}: ${ev.home_fault || ev.away_fault}`;
                        }
                        return (
                          <div key={index} class={`relative flex items-center justify-between ${isHome ? 'text-left' : 'flex-row-reverse text-right'} py-1`}>
                            <span class="absolute -left-[31px] bg-white border-2 border-gray-300 w-4 h-4 rounded-full z-10"></span>
                            <div class={`w-[85%] flex items-center ${isHome ? 'flex-row' : 'flex-row-reverse'} gap-2`}>
                              <span class="text-[11px] font-bold text-[#1C1D5F] bg-[#1C1D5F]/10 px-1.5 py-0.5 rounded border border-[#1C1D5F]/20 shadow-sm">{ev.time}'</span>
                              <span class="text-sm text-gray-700 font-medium">{detail}</span>
                            </div>
                            <div class="w-[15%] flex justify-center"><span class="text-xl">{icon}</span></div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TAB CONTENT: STATS */}
            {detailTab === 'stats' && (
              <section class="space-y-5">
                {!statsData?.statistics?.length ? (
                  <div class="bg-gray-50 text-center p-8 text-sm text-gray-500 rounded-xl border border-gray-200">Statistik belum tersedia.</div>
                ) : (
                  <div class="bg-white border border-gray-200 shadow-sm rounded-xl p-4 space-y-4">
                    {statsData.statistics.map((s, idx) => {
                      const hVal = parseFloat(s.home?.replace("%","")) || 0;
                      const aVal = parseFloat(s.away?.replace("%","")) || 0;
                      const total = hVal + aVal;
                      const hW = total > 0 ? (hVal / total) * 100 : 0;
                      const aW = total > 0 ? (aVal / total) * 100 : 0;
                      return (
                        <div key={idx} class="space-y-1.5">
                          <div class="flex justify-between text-[13px] font-bold text-gray-800 px-0.5">
                            <span>{s.home || "0"}</span>
                            <span class="text-xs text-gray-500 font-semibold">{s.type}</span>
                            <span>{s.away || "0"}</span>
                          </div>
                          <div class="flex w-full h-[6px] bg-gray-200 rounded-full overflow-hidden">
                            <div class="w-1/2 flex justify-end bg-gray-200 pr-[1px]">
                              <div class="h-full bg-[#1C1D5F] rounded-l-full transition-all" style={{ width: `${hW}%` }}></div>
                            </div>
                            <div class="w-1/2 flex justify-start bg-gray-200 pl-[1px]">
                              <div class="h-full bg-red-500 rounded-r-full transition-all" style={{ width: `${aW}%` }}></div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* TAB CONTENT: LINEUP */}
            {detailTab === 'lineup' && (
              <section class="space-y-4">
                {!lineupData?.lineup?.home ? (
                  <div class="bg-gray-50 text-center p-8 text-sm text-gray-500 rounded-xl border border-gray-200">Lineup belum tersedia.</div>
                ) : (
                  <>
                    <div class="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                      <h4 class="text-[11px] font-bold text-[#1C1D5F] uppercase tracking-wider mb-3">Pelatih Utama</h4>
                      <div class="grid grid-cols-2 text-sm font-medium text-gray-800">
                        <div class="border-r border-gray-200 pr-3">{lineupData.lineup.home.coach?.[0]?.lineup_player || "-"}</div>
                        <div class="pl-3 text-right">{lineupData.lineup.away.coach?.[0]?.lineup_player || "-"}</div>
                      </div>
                    </div>

                    <div class="bg-white border border-gray-200 shadow-sm rounded-xl p-4">
                      <h3 class="text-[11px] font-bold text-[#1C1D5F] uppercase tracking-wider mb-3">Starting Lineups</h3>
                      <div class="grid grid-cols-2 gap-x-4 text-sm">
                        <div class="border-r border-gray-200 pr-2 space-y-1">
                          {(lineupData.lineup.home.starting_lineups || []).map((p, i) => (
                            <div key={i} class="truncate py-1">[{p.lineup_number || '-'}] {p.lineup_player}</div>
                          ))}
                        </div>
                        <div class="pl-2 space-y-1 text-right">
                          {(lineupData.lineup.away.starting_lineups || []).map((p, i) => (
                            <div key={i} class="truncate py-1">{p.lineup_player} [{p.lineup_number || '-'}]</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </section>
            )}
          </main>
        </div>
      )}

      {/* BOTTOM NAV BAR (Hidden on detail page) */}
      {currentView !== 'detail' && (
        <nav id="bottom-nav" class="fixed bottom-0 left-0 w-full z-50 bg-white/95 backdrop-blur-md shadow-[0_-1px_10px_rgba(0,0,0,0.08)] pb-safe">
          <div class="max-w-2xl mx-auto flex justify-around">
            <button onClick={() => setCurrentView('matches')}
              class={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors cursor-pointer ${currentView === 'matches' ? 'text-[#1C1D5F]' : 'text-gray-400'}`}>
              <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M24.5 11.842V20.9613C24.5 23.56 22.4107 25.6666 19.8333 25.6666H8.16667C5.58934 25.6666 3.5 23.56 3.5 20.9613V11.842C3.5 10.4292 4.12959 9.09123 5.21484 8.19759L11.0482 3.39422C12.766 1.97968 15.234 1.97968 16.9518 3.39422L22.7852 8.19759C23.8704 9.09123 24.5 10.4292 24.5 11.842ZM11.6667 20.125C11.1834 20.125 10.7917 20.5167 10.7917 21C10.7917 21.4832 11.1834 21.875 11.6667 21.875H16.3333C16.8166 21.875 17.2083 21.4832 17.2083 21C17.2083 20.5167 16.8166 20.125 16.3333 20.125H11.6667Z" fill="currentColor"/>
              </svg>
              <span class="text-[11px] font-bold">Matches</span>
            </button>

            <button onClick={() => setCurrentView('live')}
              class={`flex-1 py-3 flex flex-col items-center gap-1 transition-colors cursor-pointer relative ${currentView === 'live' ? 'text-red-500' : 'text-gray-400'}`}>
              <div class="relative">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                {showLiveDot && <span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
              </div>
              <span class="text-[11px] font-bold">Live</span>
            </button>
          </div>
        </nav>
      )}
    </>
  );
}

