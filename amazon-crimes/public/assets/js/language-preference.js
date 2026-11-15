/* Shared PT/EN/ES selection for all Amazon Crimes pages. */
export const LANGUAGE_KEY='amazon-observatory-language';
const VALID=['en','pt','es'];
export const validLanguage=value=>VALID.includes(value);
export function preferredLanguage(){
  try{const v=localStorage.getItem(LANGUAGE_KEY);return validLanguage(v)?v:'en';}catch{return 'en';}
}
export function selectLanguage(value){
  if(!validLanguage(value))return preferredLanguage();
  try{if(localStorage.getItem(LANGUAGE_KEY)!==value)localStorage.setItem(LANGUAGE_KEY,value);}catch{}
  return value;
}
export function listenLanguage(callback){
  const fn=event=>{if(event.key===LANGUAGE_KEY||event.key===null)callback(preferredLanguage());};
  window.addEventListener('storage',fn);
  return ()=>window.removeEventListener('storage',fn);
}
