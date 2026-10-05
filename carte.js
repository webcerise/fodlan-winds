'use strict';
const $=id=>document.getElementById(id),editing=new URLSearchParams(location.search).get('edition')==='1';
const categories={lieu:'Lieux',residence:'Résidences',restaurant:'Bars & restaurants',commerce:'Commerces',culture:'Culture'};
const icons={lieu:'map-pin',residence:'house',restaurant:'wine',commerce:'storefront',culture:'buildings'};
const dataSource=document.querySelector('meta[name="rose-map-data"]')?.content;
const dataURL=dataSource?new URL(dataSource,location.href).href:'';
function readPlaces(text){
  if(text.trimStart().startsWith('{'))return JSON.parse(text);
  const block=new DOMParser().parseFromString(text,'text/html').querySelector('script#map-data[type="application/json"]');
  if(!block)throw Error('La page des lieux doit contenir le bloc map-data.');
  return JSON.parse(block.textContent);
}
function exportPage(){return '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8"><title>Lieux de Londres</title></head><body>\n<script type="application/json" id="map-data">\n'+JSON.stringify({version:1,places},null,2).replace(/</g,'\\u003c')+'\n</script>\n</body></html>'}
const KEY='roses-london-draft-v1',CACHE='roses-geocode-v1';
let places=[],markers=[],map,draftMarker,active='all',selectedId,lastRequest=0,searchBusy=false;
const motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
function message(text){$('status').textContent=text}
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n}
function safeURL(value){if(!value)return '';try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function validate(data){if(!data||!Array.isArray(data.places)||data.places.length>500)throw Error('Fichier invalide : 500 lieux maximum.');const ids=new Set();return data.places.map(p=>{if(!p||!p.id||ids.has(String(p.id))||typeof p.name!=='string'||!p.name.trim()||!Object.hasOwn(categories,p.category)||!Number.isFinite(p.lng)||!Number.isFinite(p.lat)||p.lng<-.55||p.lng>.35||p.lat<51.25||p.lat>51.75)throw Error('Un lieu est invalide ou situé hors de Londres.');ids.add(String(p.id));return {id:String(p.id),name:p.name.slice(0,100),category:p.category,address:String(p.address||'').slice(0,250),description:String(p.description||'').slice(0,1500),lng:p.lng,lat:p.lat,image:safeURL(p.image),link:safeURL(p.link),example:!!p.example}})}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({version:1,places}));message('Brouillon enregistré sur cet appareil. Exportez pour publier.')}catch{message('Stockage local indisponible : exportez pour conserver vos lieux.')}}
function filtered(){const q=$('search').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return places.filter(p=>(active==='all'||p.category===active)&&(p.name+' '+p.address+' '+p.description).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q))}
function renderPins(){
  markers.forEach(marker=>marker.remove());markers=[];
  if(!map)return;
  const groups=[];
  for(const place of filtered()){
    const position=map.project([place.lng,place.lat]);
    const group=map.getZoom()<18?groups.find(item=>Math.hypot(item.x-position.x,item.y-position.y)<58):null;
    if(group){group.places.push(place)}else groups.push({x:position.x,y:position.y,places:[place]});
  }
  for(const group of groups){
    const entries=group.places,first=entries[0],cluster=entries.length>1;
    const pin=el('button',undefined,cluster?'pin pin-cluster':'pin');pin.type='button';
    pin.title=cluster?entries.length+' lieux — zoomer':first.name;pin.setAttribute('aria-label',pin.title);
    if(cluster)pin.append(el('span',String(entries.length)));else pin.append(el('i',undefined,'ph-thin ph-'+icons[first.category]));
    const lng=entries.reduce((sum,p)=>sum+p.lng,0)/entries.length,lat=entries.reduce((sum,p)=>sum+p.lat,0)/entries.length;
    pin.addEventListener('click',event=>{
      event.stopPropagation();
      if(!cluster){showPlace(first);return}
      const bounds=new maplibregl.LngLatBounds();entries.forEach(p=>bounds.extend([p.lng,p.lat]));
      map.fitBounds(bounds,{padding:90,maxZoom:Math.min(map.getZoom()+2,18),duration:motion?550:0});
    });
    markers.push(new maplibregl.Marker({element:pin}).setLngLat([lng,lat]).addTo(map));
  }
}
function render(){
  const rows=filtered();$('count').textContent=rows.length+' adresse'+(rows.length===1?'':'s');$('places').replaceChildren();
  if(!rows.length)$('places').append(el('p','Aucune adresse pour cette recherche.','empty'));
  rows.forEach((p,index)=>{const row=el('button',undefined,'place-row');row.type='button';row.append(el('span',String(index+1).padStart(2,'0')));const content=el('div');content.append(el('strong',p.name),el('small',categories[p.category]+(p.example?' · exemple':'')));row.append(content);row.addEventListener('click',()=>showPlace(p));$('places').append(row)});
  renderPins();
}
function showPlace(p){selectedId=p.id;const box=$('detail-content');box.replaceChildren();if(p.image){const img=el('img');img.src=p.image;img.alt='';img.addEventListener('error',()=>img.remove());box.append(img)}const copy=el('div',undefined,'detail-copy');copy.append(el('small',categories[p.category]+(p.example?' · lieu fictif de démonstration':'')),el('h2',p.name),el('p',p.address),el('p',p.description));if(p.link){const a=el('a','Ouvrir sur le forum ↗');a.href=p.link;a.target='_blank';a.rel='noopener';copy.append(a)}if(editing){const edit=el('button','Modifier');edit.onclick=()=>editPlace(p);const remove=el('button','Supprimer');remove.onclick=()=>{if(!confirm('Supprimer « '+p.name+' » du brouillon ?'))return;places=places.filter(x=>x.id!==p.id);persist();render();$('detail').hidden=true};copy.append(edit,remove)}box.append(copy);$('detail').hidden=false;map?.easeTo({center:[p.lng,p.lat],zoom:16,padding:{left:innerWidth>850?350:0,right:editing&&innerWidth>850?350:0},duration:motion?700:0});if(innerWidth<850)$('directory').hidden=true;if(editing)$('editor').hidden=true}
function point(lng,lat){$('lng').value=lng.toFixed(6);$('lat').value=lat.toFixed(6);if(!map)return;if(!draftMarker){draftMarker=new maplibregl.Marker({color:'#c4a66b',draggable:true}).setLngLat([lng,lat]).addTo(map);draftMarker.on('dragend',()=>{const c=draftMarker.getLngLat();point(c.lng,c.lat)})}else draftMarker.setLngLat([lng,lat])}
function editPlace(p){$('detail').hidden=true;$('editor').hidden=false;for(const key of ['name','category','description','image','link','address','lng','lat'])$(key).value=p[key]||'';$('place-id').value=p.id;point(p.lng,p.lat)}
function resetForm(){$('place-form').reset();$('place-id').value='';$('address').value='';$('results').replaceChildren();draftMarker?.remove();draftMarker=null;$('detail').hidden=true;$('editor').hidden=false}
async function geocode(event){event.preventDefault();if(searchBusy)return;const query=$('address').value.trim();if(!query)return;searchBusy=true;$('find-address').disabled=true;try{let cache={};try{cache=JSON.parse(localStorage.getItem(CACHE)||'{}')}catch{};let results=cache[query.toLowerCase()];if(!results){if(Date.now()-lastRequest<1200)throw Error('Patientez un instant avant une nouvelle recherche.');lastRequest=Date.now();const url=new URL('https://nominatim.openstreetmap.org/search');url.search=new URLSearchParams({q:query,format:'jsonv2',limit:'5',countrycodes:'gb',viewbox:'-0.55,51.75,0.35,51.25',bounded:'1','accept-language':'fr'});message('Recherche de l’adresse…');const response=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('La recherche est temporairement indisponible. Placez le repère directement sur la carte.');results=await response.json();cache[query.toLowerCase()]=results;try{localStorage.setItem(CACHE,JSON.stringify(cache))}catch{}}$('results').replaceChildren();results.forEach(result=>{const b=el('button',result.display_name);b.type='button';b.onclick=()=>{point(Number(result.lon),Number(result.lat));map?.easeTo({center:[Number(result.lon),Number(result.lat)],zoom:16,duration:motion?700:0});message('Position trouvée. Vous pouvez déplacer le repère doré.')};$('results').append(b)});message(results.length?'Choisissez une adresse dans les résultats.':'Aucune adresse trouvée : essayez le nom de la rue ou cliquez sur la carte.')}catch(error){message(error.message)}finally{searchBusy=false;$('find-address').disabled=false}}
async function start(){document.body.classList.toggle('editing',editing);$('editor').hidden=!editing;$('editor-link').hidden=editing;$('toggle-editor').hidden=false;
try{if(!dataURL||dataSource.includes('URL_PAGE_LIEUX'))throw Error('Renseignez l’URL de la page des lieux dans rose-map-data.');const response=await fetch(dataURL,{cache:'no-store'});if(!response.ok)throw Error('Impossible de charger les lieux.');places=validate(readPlaces(await response.text()));if(editing){try{const draft=localStorage.getItem(KEY);if(draft)places=validate(JSON.parse(draft))}catch{message('Le brouillon local est illisible. Les lieux publiés sont affichés.')}}}catch(error){message(error.message)}
for(const [key,label] of Object.entries({all:'Tout',...categories})){const b=el('button',label);b.type='button';b.setAttribute('aria-pressed',String(key==='all'));b.onclick=()=>{active=key;Array.from($('filters').children).forEach(n=>n.setAttribute('aria-pressed',String(n===b)));render()};$('filters').append(b)}render();
if(!window.maplibregl){message('Le moteur de carte n’a pas chargé. Vérifiez votre connexion puis rechargez la page.');return}
try{const response=await fetch('https://tiles.openfreemap.org/styles/dark',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Fond de carte indisponible.');const style=await response.json();style.layers=style.layers.filter(layer=>layer.type!=='symbol'||['transportation_name','water_name'].includes(layer['source-layer']));for(const layer of style.layers){if(layer.type==='background')layer.paint['background-color']='#191919';if(layer.type==='fill')layer.paint['fill-color']=layer['source-layer']==='water'?'#101010':layer['source-layer']==='building'?'#3b3b3b':'#222222';if(layer.type==='line'&&layer.paint?.['line-color'])layer.paint['line-color']=layer['source-layer']==='waterway'?'#111111':'#505050';if(layer.type==='symbol'){layer.paint={...layer.paint,'text-color':'#c4c4c4','text-halo-color':'#202020'}}}
// Draw all ground layers before buildings, then keep street labels above them.
style.layers=[...style.layers.filter(layer=>layer.type!=='symbol'),...style.layers.filter(layer=>layer.type==='symbol')];
const buildings=style.layers.find(l=>l['source-layer']==='building');if(buildings){delete buildings.paint['fill-outline-color'];buildings.paint['fill-antialias']=false;style.layers.splice(style.layers.findIndex(l=>l.type==='symbol'),0,{id:'roses-buildings',type:'fill-extrusion',source:buildings.source,'source-layer':'building',minzoom:14,filter:['!=',['get','hide_3d'],true],paint:{'fill-extrusion-color':'#626262','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':1}})}
map=new maplibregl.Map({container:'map',style,center:[-.145,51.509],zoom:14.8,pitch:52,bearing:-22,maxPitch:65,maxBounds:[[-.55,51.25],[.35,51.75]],attributionControl:false});map.addControl(new maplibregl.AttributionControl({compact:false}),'bottom-right');map.addControl(new maplibregl.NavigationControl({showCompass:true}),'bottom-left');map.on('load',()=>{render();message('')});map.on('moveend',renderPins);map.on('resize',renderPins);map.on('error',()=>message('Certaines données cartographiques sont indisponibles. Vérifiez votre connexion.'));if(editing)map.on('click',event=>{if(event.originalEvent.target.closest('button'))return;point(event.lngLat.lng,event.lngLat.lat);$('editor').hidden=false;message('Position ajustée. Complétez puis enregistrez le lieu.')});}catch(error){message('Carte indisponible : '+error.message)}}
$('toggle-editor').onclick=()=>{if(!editing){const url=new URL(location.href);url.searchParams.set('edition','1');location.href=url.href;return} $('editor').hidden=!$('editor').hidden};
$('search').oninput=render;$('toggle-directory').onclick=()=>{$('directory').hidden=!$('directory').hidden};$('close-detail').onclick=()=>{$('detail').hidden=true;if(editing)$('editor').hidden=false};$('perspective').onclick=()=>{if(!map)return;const three=map.getPitch()<10;map.easeTo({pitch:three?52:0,bearing:three?-22:0,duration:motion?500:0});$('perspective').setAttribute('aria-pressed',String(three))};$('recenter').onclick=()=>map?.easeTo({center:[-.145,51.509],zoom:14.8,padding:{left:0,right:0,top:0,bottom:0},duration:motion?650:0});
$('address-search').onsubmit=geocode;$('new-place').onclick=resetForm;
$('place-form').onsubmit=event=>{event.preventDefault();if(!editing)return;const data={id:$('place-id').value||crypto.randomUUID(),name:$('name').value.trim(),category:$('category').value,address:$('address').value,description:$('description').value,image:$('image').value,link:$('link').value,lng:Number($('lng').value),lat:Number($('lat').value)};try{const p=validate({places:[data]})[0];const index=places.findIndex(x=>x.id===p.id);if(index<0)places.push(p);else places[index]=p;persist();render();resetForm()}catch(error){message(error.message)}};
$('export').onclick=()=>{const blob=new Blob([exportPage()],{type:'text/html;charset=utf-8'});const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='lieux.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Fichier exporté : collez son contenu dans la page HTML des lieux pour publier.')};
$('import').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>2e6)throw Error('Fichier trop volumineux.');const next=validate(readPlaces(await file.text()));if(!confirm('Remplacer le brouillon par les '+next.length+' lieux du fichier ?'))return;places=next;persist();render();resetForm()}catch(error){message(error.message)}finally{event.target.value=''}};
document.getElementById("close-editor").onclick=()=>{document.getElementById("editor").hidden=true};
start();





