import {examples,photoURL} from './examples.js';
const $=id=>document.getElementById(id);
const sampleId=new URL(location.href).searchParams.get('foto');
const canvas=$('paint'), ink=canvas.getContext('2d'), mask=document.createElement('canvas');
mask.width=mask.height=1024;
const shape=mask.getContext('2d');
let current,upload,original,result,paint=false,marked=false,stroke=null,mode='edit',busy=false,balance=null,showing=false;
let localPreview,loadToken=0;
const announce=text=>{$('status').textContent=text};
function controls(){
  const enabled=k=>balance&&!balance.paused&&balance[k].funded&&balance[k].remaining>0;
  $('apply').disabled=busy||!enabled('image');$('idea').disabled=busy||!enabled('prompt');
  for(const el of document.querySelectorAll('.modes button,.samples button,#upload,#brush,#clear,#preview,#consent,#prompt')) el.disabled=busy;
  $('brush').hidden=mode!=='edit'||!original||showing;
  $('clear').hidden=!marked||showing||mode!=='edit';
  $('paint').hidden=showing||mode!=='edit'||(!paint&&!marked);
  $('paint').style.pointerEvents=paint?'auto':'none';
  $('brush').setAttribute('aria-pressed',String(paint));
  $('brush').textContent=paint?'Concluir seleção':'Selecionar com pincel';
  $('sources').hidden=mode!=='edit';
  $('edit').setAttribute('aria-pressed',String(mode==='edit'));$('create').setAttribute('aria-pressed',String(mode==='create'));
  $('apply').firstChild.textContent=mode==='edit'?'Aplicar edição ':'Criar imagem ';
}
async function refresh(){
  try{const r=await fetch('./api/status',{cache:'no-store'});if(!r.ok)throw Error();balance=await r.json();
    $('quota').textContent=balance.image.remaining+' de 5 imagens · '+balance.prompt.remaining+' de 5 prompts';
    if(balance.paused) announce('A demonstração está pausada. Os exemplos continuam disponíveis.');
    else if(!balance.image.funded||!balance.prompt.funded) announce('Limite mensal atingido para '+[!balance.image.funded?'imagens':'',!balance.prompt.funded?'prompts':''].filter(Boolean).join(' e ')+'. Os exemplos continuam disponíveis.');
  }catch{balance=null;$('quota').textContent='Saldo indisponível. Recarregue para consultar.'}controls();
}
function clearMask(){ink.clearRect(0,0,1024,1024);shape.globalCompositeOperation='source-over';shape.fillStyle='white';shape.fillRect(0,0,1024,1024);marked=false;paint=false;stroke=null}
function split(){const n=$('slider').value;$('after').style.clipPath='inset(0 0 0 '+n+'%)';$('divider').style.left=n+'%'}
function view(compare){
  showing=!!(compare&&result&&original&&mode==='edit');
  $('frame').classList.toggle('comparing',showing);
  $('after').hidden=!showing;$('divider').hidden=!showing;$('compareLabels').hidden=!showing;$('sliderRow').hidden=!showing;
  $('base').hidden=!original&&!(mode==='create'&&result);
  if(!$('base').hidden)$('base').src=original||result;else $('base').removeAttribute('src');
  $('base').alt=mode==='edit'?'Foto original de '+$('scene').textContent:'Imagem criada no Lume Studio';
  if(result)$('after').src=result;else $('after').removeAttribute('src');
  $('viewName').textContent=showing?'Comparação':mode==='create'?(result?'Resultado':'Tela de criação'):'Foto original';
  $('preview').hidden=!result||mode!=='edit';
  $('preview').textContent=showing?'Voltar à foto':current&&result===photoURL(current.id,'depois')?'Ver edição do exemplo':'Comparar resultado';
  $('download').hidden=!result;if(result){$('download').href=result;$('download').download=result.startsWith('data:')?'lume-studio.png':'lume-studio.webp'}
  split();controls();
}
function select(e){
  loadToken++;if(localPreview){URL.revokeObjectURL(localPreview);localPreview=null}
  current=e;upload=null;mode='edit';original=photoURL(e.id,'antes');result=photoURL(e.id,'depois');$('upload').value='';$('prompt').value=e.prompt;$('scene').textContent=e.name;
  for(const b of $('samples').children)b.setAttribute('aria-pressed',String(b.dataset.id===e.id));
  clearMask();announce('');view(false);
}
for(const e of examples){
  const button=document.createElement('button'),img=new Image(),label=document.createElement('span');
  button.type='button';button.dataset.id=e.id;button.setAttribute('aria-label',e.name);img.src=photoURL(e.id,'antes');img.alt='';label.textContent=e.name;button.append(img,label);button.onclick=()=>select(e);$('samples').append(button);
}
$('edit').onclick=()=>{if(mode!=='edit')select(current||examples[0])};
$('create').onclick=()=>{if(mode==='create')return;loadToken++;mode='create';clearMask();original=null;result=null;upload=null;$('prompt').value='';$('scene').textContent='Nova imagem';announce('');view(false)};
$('preview').onclick=()=>{paint=false;view(!showing)};
$('slider').oninput=split;
const frame=$('frame');
let sliding=null;
function moveDivider(event){
  const bounds=frame.getBoundingClientRect();
  const position=Math.round(100*(event.clientX-bounds.left)/bounds.width);
  $('slider').value=String(Math.max(0,Math.min(100,position)));
  split();
}
frame.addEventListener('pointerdown',event=>{
  if(!showing||event.button!==0)return;
  sliding=event.pointerId;
  frame.setPointerCapture(sliding);
  moveDivider(event);
});
frame.addEventListener('pointermove',event=>{if(event.pointerId===sliding)moveDivider(event)});
frame.addEventListener('lostpointercapture',()=>{sliding=null});
$('brush').onclick=()=>{paint=!paint;controls();if(paint)announce('Passe o pincel sobre a área que deseja editar.')};
$('clear').onclick=()=>{clearMask();controls();announce('Seleção removida.')};
function point(e){const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*1024/r.width,(e.clientY-r.top)*1024/r.height]}
function line(from,to){for(const [ctx,color,op] of [[ink,'#df6490','source-over'],[shape,'#000','destination-out']]){
  ctx.globalCompositeOperation=op;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=46;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(...from);ctx.lineTo(...to);ctx.stroke();ctx.beginPath();ctx.arc(...to,23,0,Math.PI*2);ctx.fill();
}marked=true;$('clear').hidden=false}
canvas.onpointerdown=e=>{if(!paint||busy)return;canvas.setPointerCapture(e.pointerId);stroke=point(e);line(stroke,stroke)};
canvas.onpointermove=e=>{if(!stroke)return;const next=point(e);line(stroke,next);stroke=next};
canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=()=>{stroke=null};
$('upload').onchange=async()=>{
  const file=$('upload').files[0];if(!file)return;const token=++loadToken;
  try {
    if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use um JPEG, PNG ou WebP de até 5 MB.');
    const bmp=await createImageBitmap(file);if(bmp.width*bmp.height>16000000){bmp.close();throw Error('Use uma foto de até 16 megapixels.')}
    const c=document.createElement('canvas');c.width=c.height=1024;const ctx=c.getContext('2d');ctx.fillStyle='#f4f0eb';ctx.fillRect(0,0,1024,1024);
    const scale=1024/Math.max(bmp.width,bmp.height),w=bmp.width*scale,h=bmp.height*scale;
    ctx.drawImage(bmp,(1024-w)/2,(1024-h)/2,w,h);bmp.close();
    const blob=await new Promise(resolve=>c.toBlob(resolve,'image/webp',0.95));if(token!==loadToken)return;
    if(localPreview)URL.revokeObjectURL(localPreview);localPreview=URL.createObjectURL(blob);
    original=localPreview;upload=file;result=null;current=null;mode='edit';$('scene').textContent='Sua foto';$('prompt').value='';
    for(const b of $('samples').children)b.setAttribute('aria-pressed','false');
    clearMask();announce('Foto aberta neste dispositivo. Descreva a mudança desejada.');view(false);
  }catch(e){if(token===loadToken)announce(e.message)}
};
async function send(bucket){
  if(busy)return;
  if(!$('consent').checked){announce('Confirme o envio à OpenAI antes de continuar.');$('consent').focus();return}
  const prompt=$('prompt').value.trim();
  if(bucket==='image'&&(!prompt||new TextEncoder().encode(prompt).length>1600)){announce('Escreva um pedido de até 1.600 bytes.');$('prompt').focus();return}
  busy=true;paint=false;controls();announce(bucket==='prompt'?'Gerando um prompt…':'Processando a imagem…');
  try{
    const form=new FormData();form.set('consent','yes');
    if(bucket==='image'){
      form.set('mode',mode);form.set('prompt',prompt);
      if(mode==='edit'){
        const file=upload||await (await fetch(original)).blob();form.set('image',file,'foto');
        if(marked)form.set('mask',await new Promise(resolve=>mask.toBlob(resolve,'image/png')),'selecao.png');
      }
    }
    const resp=await fetch('./api/'+bucket,{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:form});
    const data=await resp.json();if(!resp.ok)throw Error(data.error);
    if(bucket==='prompt'){$('prompt').value=data.idea;announce('Prompt pronto. Você pode ajustá-lo antes de usar.')}
    else{result='data:image/png;base64,'+data.image;clearMask();view(mode==='edit');announce('Imagem pronta para baixar.')}
  }catch(e){announce(e.message||'Falha na conexão. Consulte o saldo antes de repetir.')}
  finally{busy=false;await refresh()}
}
$('idea').onclick=()=>send('prompt');$('apply').onclick=()=>send('image');
select(examples.find(e=>e.id===sampleId)||examples[0]);refresh();
