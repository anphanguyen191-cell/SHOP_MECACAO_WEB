import {useEffect,useRef} from 'react'
/** Shared navigation/reload guard. Keeps input in place; never writes shop data. */
export function useUnsavedChanges(dirty:boolean,onBlocked:()=>void){
 const blocked=useRef(onBlocked);blocked.current=onBlocked
 useEffect(()=>{if(!dirty)return;const navigation=(e:Event)=>{e.preventDefault();blocked.current()},unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('mecacao-before-navigate',navigation);window.addEventListener('beforeunload',unload);return()=>{window.removeEventListener('mecacao-before-navigate',navigation);window.removeEventListener('beforeunload',unload)}},[dirty])
}
