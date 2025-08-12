import React, { useEffect, useMemo, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
// ❌ 删除这一行： import 'pdfjs-dist/build/pdf.worker.js'
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs'


const BASIC_WORDS = new Set('the,of,and,to,a,in,that,is,for,it,as,was,with,be,by,on,are,at,from,or,an,this,which,have,has,not,were,can,will,more,one,about,also,into,other,than,its,may,like,over,after,between,first,new,use,used,using,study,research,market,price,year,years,percent,people,company,products,service'.split(','))

const splitSentences = (text) => text.replace(/\s+/g,' ').split(/(?<=[.!?])\s+(?=[A-Z\d\"'])/).map(s=>s.trim()).filter(Boolean)
const tokenize = (text) => text.toLowerCase().replace(/[^a-z\-' \n]/g,' ').split(/\s+/).filter(Boolean)
const wordFreq = (tokens) => { const m=new Map(); tokens.forEach(t=>m.set(t,(m.get(t)||0)+1)); return [...m.entries()].sort((a,b)=>b[1]-a[1])}
const isDifficult = (w)=>!BASIC_WORDS.has(w)&&w.length>=4
const extractPhrases=(tokens,n=2)=>{const STOP=new Set(['the','of','and','to','a','in','for','on','with','as','by','at']); const g=new Map(); for(let i=0;i<=tokens.length-n;i++){const s=tokens.slice(i,i+n); if(s.some(w=>STOP.has(w))) continue; const k=s.join(' '); g.set(k,(g.get(k)||0)+1);} return [...g.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20) }
const pickLong=(sents)=> sents.filter(s=> s.split(/\s+/).length>25 || /,?\s*(that|which|because|although|while|whereas|since|when)\b/i.test(s)).slice(0,8)
const analyzeStructure=(text,tokens)=>{ const paras=text.split(/\n{2,}/).map(p=>p.trim()).filter(Boolean); const heads=paras.map((p,i)=>({idx:i+1, lead: (splitSentences(p)[0]||p.slice(0,120)+'…')})); const freq=wordFreq(tokens).slice(0,20).map(([w])=>w); return {paras:heads, themes:freq} }
const summarize=(text)=>{ const sents=splitSentences(text); const tokens=tokenize(text); const fm=new Map(wordFreq(tokens)); const score=(s)=> tokenize(s).reduce((a,w)=>a+(fm.get(w)||0),0)/(s.split(' ').length+1); const ranked=sents.map(s=>({s,v:score(s)})).sort((a,b)=>b.v-a.v); return ranked.slice(0, Math.max(3, Math.floor(sents.length*0.1))).map(x=>x.s) }
const relatedLinks=(themes)=>{ const q=encodeURIComponent(themes.slice(0,4).join(' ')); return [{name:'Google News',url:`https://news.google.com/search?q=${q}&hl=en-US&gl=US&ceid=US:en`},{name:'The Economist',url:`https://www.economist.com/search?q=${q}`},{name:'NYTimes',url:`https://www.nytimes.com/search?query=${q}`} ]}
const levenshtein=(a,b)=>{ const m=a.length,n=b.length; const dp=Array.from({length:m+1},()=>Array(n+1).fill(0)); for(let i=0;i<=m;i++) dp[i][0]=i; for(let j=0;j<=n;j++) dp[0][j]=j; for(let i=1;i<=m;i++){ for(let j=1;j<=n;j++){ const c=a[i-1]===b[j-1]?0:1; dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+c) }} return 1-dp[m][n]/Math.max(m,n) }
const speak=(text)=>{ const u=new SpeechSynthesisUtterance(text); u.lang='en-US'; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u) }
const listenOnce=()=> new Promise((res,rej)=>{ const SR=window.SpeechRecognition||window.webkitSpeechRecognition; if(!SR) return rej('SpeechRecognition not supported'); const r=new SR(); r.lang='en-US'; r.interimResults=false; r.maxAlternatives=1; r.onresult=(e)=>res(e.results[0][0].transcript); r.onerror=(e)=>rej(e.error); r.start() })

const storeKey=(k)=>`eglass_reader_${k}`

export default function App(){
  const [raw, setRaw]=useState('')
  const [title,setTitle]=useState('')
  const [level,setLevel]=useState(localStorage.getItem(storeKey('level'))||'HS-3k')
  const [unlocked,setUnlocked]=useState(localStorage.getItem(storeKey('unlocked'))==='1')
  const [history,setHistory]=useState(()=>JSON.parse(localStorage.getItem(storeKey('history'))||'[]'))
  const [notes,setNotes]=useState('')
  const [diary,setDiary]=useState('')
  const [post,setPost]=useState('')
  const [pron,setPron]=useState(null)

  useEffect(()=>localStorage.setItem(storeKey('level'),level),[level])
  useEffect(()=>localStorage.setItem(storeKey('unlocked'),unlocked?'1':'0'),[unlocked])
  useEffect(()=>localStorage.setItem(storeKey('history'),JSON.stringify(history)),[history])

  const tokens=useMemo(()=>tokenize(raw),[raw])
  const sents=useMemo(()=>splitSentences(raw),[raw])
  const diff=useMemo(()=> wordFreq(tokens).filter(([w])=>isDifficult(w)).slice(0,80),[tokens])
  const phrases=useMemo(()=> [...extractPhrases(tokens,2).slice(0,10), ...extractPhrases(tokens,3).slice(0,10) ],[tokens])
  const longSents=useMemo(()=>pickLong(sents),[sents])
  const structure=useMemo(()=>analyzeStructure(raw,tokens),[raw,tokens])
  const summary=useMemo(()=>summarize(raw),[raw])

  const handlePDF = async (file)=>{
    try{
      const buf=await file.arrayBuffer()
      const pdf=await pdfjsLib.getDocument({data:buf}).promise
      let text=''
      for(let p=1;p<=pdf.numPages;p++){
        const page=await pdf.getPage(p)
        const c=await page.getTextContent()
        text+= c.items.map(it=>it.str||'').join(' ') + '\n\n'
      }
      setRaw(text.trim())
      setTitle(file.name.replace(/\.pdf$/i,''))
      setUnlocked(false); setPron(null); setNotes(''); setDiary(''); setPost('')
    }catch(e){ alert('PDF 解析失败: '+e.message) }
  }

  const sum0 = summary[0]||''
  const quiz = useMemo(()=>{
    const sent=sum0 || sents[0] || ''
    const m=sent.match(/\b(\w{6,})\b/)
    const answer=m?m[1]:''
    return { fill: sent.replace(/\b(\w{6,})\b/,'_____'), answer, choices: diff.slice(0,8).map(([w])=>w) }
  },[sum0,sents,diff])

  const saveLesson=()=>{
    const record={ time:new Date().toISOString(), title, themes:structure.themes.slice(0,8), difficult: diff.slice(0,30).map(([w])=>w) }
    setHistory([record, ...history]); alert('本课已保存')
  }

  const buildDiary=()=>{
    const theme=structure.themes.slice(0,5).join(', ')
    const s=summary.join(' ')
    const txt = `# Reading Diary: ${title}\n\n**Key themes:** ${theme}.\n\n**What I learned (EN):** ${s}\n\n**我的理解（CN）:** 今天我学习了主题“${theme}”。我能用自己的话复述核心脉络，并挑出3个生词复盘。`
    setDiary(txt)
  }

  const buildPost=()=>{
    const s = summary[0] || ''
    setPost(`LinkedIn Post (draft)\n—\nTitle: What this article gets right about ${structure.themes[0]||'the topic'}\n\nTakeaway: ${s}\n\n#Eukaglass #LearnEnglish #BusinessEnglish`)
  }

  const links = useMemo(()=>relatedLinks(structure.themes),[structure])

  return (
    <div className="container">
      <div className="row" style={{justifyContent:'space-between'}}>
        <div>
          <h1 className="title">外刊精读学习助理 · Web</h1>
          <p className="subtitle">PDF → 词汇/短语/长难句 → 结构/要点 → 输出/发音/测验 → 解锁</p>
        </div>
        <div className="row">
          <label className="muted">词汇档位：</label>
          <select value={level} onChange={e=>setLevel(e.target.value)}>
            <option value="HS-3k">高中 3k</option>
            <option value="CET4-5k">CET4 5k</option>
            <option value="CET6-7k">CET6 7k</option>
          </select>
        </div>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div className="row">
          <input type="file" accept="application/pdf" onChange={(e)=> e.target.files && handlePDF(e.target.files[0]) }/>
          <button className="btn">上传 PDF</button>
          {title ? <span className="pill">{title}</span> : <span className="muted">（选择文件后会自动解析）</span>}
        </div>
      </div>

      {!raw && (
        <div className="card" style={{marginTop:16,textAlign:'center',color:'#64748b'}}>
          上传你的第一篇外刊 PDF，开始精读之旅。
        </div>
      )}

      {raw && (
        <div className="grid grid-2" style={{marginTop:16}}>
          <div className="card">
            <div className="title" style={{fontSize:16}}>自动摘要</div>
            <ul>{summary.map((s,i)=>(<li key={i}>{s}</li>))}</ul>
            <div className="subtitle" style={{marginTop:8}}>主题关键词</div>
            <div>{structure.themes.slice(0,12).map(t=>(<span key={t} className="badge">{t}</span>))}</div>
            <div className="subtitle" style={{marginTop:8}}>相关素材</div>
            <div className="row">{links.map(l=>(<a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="badge" style={{textDecoration:'none'}}>{l.name}</a>))}</div>
          </div>

          <div className="card">
            <div className="title" style={{fontSize:16}}>文章结构（每段首句）</div>
            <ol>{structure.paras.map(p=>(<li key={p.idx} style={{marginBottom:6}}>{p.lead}</li>))}</ol>
          </div>

          <div className="card">
            <div className="title" style={{fontSize:16}}>重点词汇（Top 80）</div>
            <div className="row">{diff.map(([w,n])=>(<span key={w} className="badge">{w} · {n}</span>))}</div>
          </div>

          <div className="card">
            <div className="title" style={{fontSize:16}}>常用短语（2-3 gram）</div>
            <ul>{[...phrases].map(([p,n])=>(<li key={p}><span className="badge">{n}</span> {p}</li>))}</ul>
          </div>

          <div className="card">
            <div className="title" style={{fontSize:16}}>长难句（点击扬声器朗读 / 话筒跟读打分）</div>
            {pickLong(sents).map((s,i)=>(
              <div key={i} style={{border:'1px solid #e5e7eb',borderRadius:12,padding:10, marginBottom:8}}>
                <div className="row">
                  <button className="btn outline" onClick={()=>speak(s)}>🔊 朗读</button>
                  <button className="btn outline" onClick={async()=>{
                    try{ const heard=await listenOnce(); const sc=Math.round(levenshtein(s.toLowerCase(), heard.toLowerCase())*100); setPron(sc) }
                    catch(e){ alert('识别失败: '+e) }
                  }}>🎤 跟读打分</button>
                  {pron!==null && <span className="pill">Score {pron}</span>}
                </div>
                <div style={{marginTop:6}}>{s}</div>
                <div className="muted" style={{marginTop:6}}>提示：先找主干（主语/谓语/宾语），再定位从句（that/which/when/since 等）。</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="row">
              <button className="btn" onClick={buildDiary}>生成日记</button>
              <button className="btn outline" onClick={buildPost}>生成 Post</button>
              <button className="btn outline" onClick={saveLesson}>保存本课</button>
            </div>
            <div style={{marginTop:8}}>
              <div className="subtitle">学习日记</div>
              <textarea rows={8} value={diary} onChange={e=>setDiary(e.target.value)} placeholder="点击“生成日记”，可自行微调..."></textarea>
            </div>
            <div style={{marginTop:8}}>
              <div className="subtitle">社媒 Post</div>
              <textarea rows={6} value={post} onChange={e=>setPost(e.target.value)} placeholder="点击“生成 Post”，可自行微调..."></textarea>
            </div>
          </div>

          <div className="card">
            <div className="title" style={{fontSize:16}}>小测验（通关解锁下一课）</div>
            <div className="muted" style={{marginBottom:6}}>完形填空</div>
            <div style={{marginBottom:6}}>{quiz.fill}</div>
            <input type="text" id="blank" placeholder="输入缺失单词..." />
            <div className="row" style={{marginTop:8}}>
              <button className="btn outline" onClick={()=>{
                const ans=document.getElementById('blank').value.trim().toLowerCase()
                const ok= ans && quiz.answer && (ans===quiz.answer.toLowerCase())
                setUnlocked(!!ok)
                alert(ok? '通关！已解锁下一课' : '再想想，或回到摘要/词汇复盘一下~')
              }}>提交</button>
              {!unlocked ? <span className="pill">🔒 未解锁</span> : <span className="pill">✅ 已解锁</span>}
            </div>
            <div style={{marginTop:12}}>
              <div className="muted">词义快问快答（点词自测）</div>
              <div className="row" style={{marginTop:6}}>{quiz.choices.map(w=>(<span key={w} className="badge" title="点一下，脑内回忆中文义">{w}</span>))}</div>
            </div>
          </div>

          <div className="card">
            <div className="title" style={{fontSize:16}}>目标追踪</div>
            <div className="row" style={{justifyContent:'space-between'}}>
              <div>年度目标：200 篇</div>
              <div>{history.length} / 200</div>
            </div>
            <div className="progress" style={{marginTop:8}}><div style={{width: Math.min(100, (history.length/200)*100)+'%'}}></div></div>
            <div className="muted" style={{marginTop:6}}>保存每课后自动累计；数据保存在浏览器本地。</div>
          </div>
        </div>
      )}
    </div>
  )
}
