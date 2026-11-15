import { preferredLanguage, listenLanguage } from './language-preference.js?v=20261115-unified';
const labels={pt:'Como funciona',en:'How it works',es:'Cómo funciona'};
function sync(){
 const lang=preferredLanguage(),link=document.querySelector('#how-it-works-link'),label=document.querySelector('#how-it-works-label');
 if(label)label.textContent=labels[lang];
 if(link)link.href='./how-it-works.html?lang='+lang;
}
const switcher=document.querySelector('.language-switcher');
if(switcher)new MutationObserver(sync).observe(switcher,{subtree:true,attributes:true,attributeFilter:['class']});
listenLanguage(sync);sync();
