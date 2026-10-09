import {useEffect,useRef,useState} from 'react'
import {apiJson} from './uiState'

export default function FolderPicker({title,onPick,onClose}:{title:string;onPick:(path:string)=>void;onClose:()=>void}){
 const [roots,setRoots]=useState<string[]>([]),[current,setCurrent]=useState(''),[typedPath,setTypedPath]=useState(''),[parent,setParent]=useState<string|null>(null),[dirs,setDirs]=useState<Array<{name:string;path:string}>>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true)
 const request=useRef<AbortController|null>(null)
 useEffect(()=>{
  const controller=new AbortController()
  apiJson<string[]>('/api/fs/roots',{signal:controller.signal}).then(setRoots).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>{controller.abort();request.current?.abort()}
 },[])
 async function open(p:string){
  if(!p.trim())return
  request.current?.abort()
  const controller=new AbortController();request.current=controller
  setError('');setLoading(true)
  try{
   const j=await apiJson('/api/fs/list?path='+encodeURIComponent(p.trim()),{signal:controller.signal})
   if(!controller.signal.aborted){setCurrent(j.path);setTypedPath(j.path);setParent(j.parent);setDirs(j.directories??[])}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Không mở được thư mục')}
  finally{if(!controller.signal.aborted)setLoading(false)}
 }
 return <div className="folderOverlay" onKeyDown={e=>{if(e.key==='Escape')onClose()}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="folderModal" role="dialog" aria-modal="true" aria-label={title}>
  <div className="row"><div><p className="eyebrow">CHỌN THƯ MỤC TRÊN MÁY</p><h3>{title}</h3></div><button onClick={onClose} aria-label="Đóng chọn thư mục">ĐÓNG</button></div>
  <form className="folderDirectPath" onSubmit={e=>{e.preventDefault();void open(typedPath)}}><label htmlFor="folder-direct-path">Dán đường dẫn hoặc duyệt thư mục bên dưới</label><div className="row"><input id="folder-direct-path" value={typedPath} onChange={e=>setTypedPath(e.target.value)} placeholder="Dán đường dẫn từ File Explorer..."/><button disabled={loading||!typedPath.trim()}>MỞ</button></div></form>
  {current&&<div className="folderPath"><button disabled={loading} onClick={()=>{request.current?.abort();setCurrent('');setTypedPath('');setError('')}}>Ổ ĐĨA</button><button disabled={!parent||loading} onClick={()=>parent&&void open(parent)}>← LÊN</button><code>{current}</code></div>}
  {loading&&<p className="loadingState" role="status">Đang đọc thư mục...</p>}
  {!loading&&(!current?<div className="driveGrid">{roots.map(r=><button key={r} onClick={()=>void open(r)}>Ổ {r}</button>)}</div>:<><div className="folderList">{dirs.map(d=><button key={d.path} onClick={()=>void open(d.path)}><span>📁</span><b>{d.name}</b></button>)}{dirs.length===0&&<p>Thư mục này không có thư mục con.</p>}</div><button className="primary chooseFolder" disabled={!!error} onClick={()=>onPick(current)}>CHỌN THƯ MỤC NÀY</button></>)}
  {error&&<p className="notice warning" role="alert">{error}</p>}
 </section></div>
}
