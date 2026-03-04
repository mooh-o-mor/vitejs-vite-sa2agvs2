import { useState } from "react";

const COLORS = [
  "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6",
  "#EC4899","#06B6D4","#84CC16","#F97316","#6366F1",
  "#14B8A6","#F43F5E","#A855F7","#22C55E","#EAB308"
];

const MONTHS = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

const initialVessels = [
  {id:1,name:"МФАСС Балтика"},{id:2,name:"МФАСС Берингов Пролив"},
  {id:3,name:"МФАСС Мурман"},{id:4,name:"МФАСС Спасатель Карев"},
  {id:5,name:"МФАСС Спасатель Кавдейкин"},{id:6,name:"МФАСС Спасатель Заборщиков"},
  {id:7,name:"МФАСС Спасатель Демидов"},{id:8,name:"МФАСС Спасатель Ильин"},
  {id:9,name:"ТБС Умка"},{id:10,name:"ТБС Нарвал"},
  {id:11,name:"ТБС Сивуч"},{id:12,name:"ТБС Финвал"},
  {id:13,name:"ТБС Сейвал"},{id:14,name:"ССН Балтийский Исследователь"},
  {id:15,name:"МФАСС Бахтемир"},{id:16,name:"МФАСС Бейсуг"},
  {id:17,name:"МФАСС Калас"},{id:18,name:"МФАСС Пильтун"},
  {id:19,name:"ССН Артемис Оффшор"},{id:20,name:"ТБС Нефтегаз-55"},
  {id:21,name:"ТБС Отто Шмидт"},{id:22,name:"ТБС Капитан Мартышкин"},
  {id:23,name:"ТБС Ясный"},{id:24,name:"МБС Капитан Беклемишев"},
  {id:25,name:"МБС Эпрон"},{id:26,name:"МБС Атлас"},
  {id:27,name:"МБС Рубин"},{id:28,name:"МБС Лазурит"},
  {id:29,name:"ТБС Светломор-3"},{id:30,name:"МВС Ст. Град Ярославль"},
  {id:31,name:"МВС Углич"},{id:32,name:"МВС Ростов Великий"},
  {id:33,name:"МВС Рыбинск"},{id:34,name:"МБ Амбер"},
  {id:35,name:"МБ Руби"},{id:36,name:"МБ Бэй"},
  {id:37,name:"ССН Игорь Ильин"},{id:38,name:"МБ Пенай"},
  {id:39,name:"НИС Виктор Буйницкий"},{id:40,name:"НИС Импульс"},
];

const YEAR = 2026;
const yearStart = new Date(YEAR, 0, 1);
const yearEnd = new Date(YEAR, 11, 31);
const totalDays = (yearEnd.getTime() - yearStart.getTime()) / 86400000 + 1;

function dayOffset(dateStr) {
  const d = new Date(dateStr);
  return Math.max(0, Math.min((d - yearStart) / 86400000, totalDays));
}
function contractDays(start, end) {
  const s = new Date(Math.max(new Date(start), yearStart));
  const e = new Date(Math.min(new Date(end), yearEnd));
  return Math.max(0, (e - s) / 86400000 + 1);
}
function fmoney(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₽";
}

const typeOrder = ["МФАСС","ТБС","ССН","МБС","МВС","МБ","НИС"];
function getType(name) {
  for (const t of typeOrder) if (name.startsWith(t)) return t;
  return "Другие";
}

let nextId = 200;

export default function App() {
  const [vessels, setVessels] = useState(initialVessels);
  const [contracts, setContracts] = useState([]);
  const [activeTab, setActiveTab] = useState("gantt");
  const [filterType, setFilterType] = useState("Все");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [activeVessel, setActiveVessel] = useState(null);
  const [newName, setNewName] = useState("");
  const [form, setForm] = useState({counterparty:"",start:`${YEAR}-01-01`,end:`${YEAR}-12-31`,rate:"",mob:"",demob:""});

  const cpList = [...new Set(contracts.map(c => c.counterparty))];
  const colorMap = Object.fromEntries(cpList.map((cp,i) => [cp, COLORS[i % COLORS.length]]));
  const allTypes = ["Все", ...typeOrder.filter(t => vessels.some(v => getType(v.name)===t))];
  const filtered = filterType==="Все" ? vessels : vessels.filter(v => getType(v.name)===filterType);

  function openAdd(vid) {
    setEditId(null);
    setForm({counterparty:"",start:`${YEAR}-01-01`,end:`${YEAR}-12-31`,rate:"",mob:"",demob:""});
    setActiveVessel(vid); setShowForm(true);
  }
  function openEdit(c) {
    setEditId(c.id);
    setForm({counterparty:c.counterparty,start:c.start,end:c.end,rate:c.rate,mob:c.mob,demob:c.demob});
    setActiveVessel(c.vesselId); setShowForm(true);
  }
  function save() {
    if (!form.counterparty||!form.start||!form.end) return;
    const data={...form,rate:+form.rate||0,mob:+form.mob||0,demob:+form.demob||0};
    if (editId) setContracts(cs=>cs.map(c=>c.id===editId?{...c,...data}:c));
    else setContracts(cs=>[...cs,{id:nextId++,vesselId:activeVessel,...data}]);
    setShowForm(false);
  }
  function delC(id){setContracts(cs=>cs.filter(c=>c.id!==id));setShowForm(false);}
  function addV(){if(!newName.trim())return;setVessels(vs=>[...vs,{id:nextId++,name:newName.trim()}]);setNewName("");}
  function delV(id){setVessels(vs=>vs.filter(v=>v.id!==id));setContracts(cs=>cs.filter(c=>c.vesselId!==id));}

  function econ(vid){
    return contracts.filter(c=>c.vesselId===vid).map(c=>{
      const days=contractDays(c.start,c.end);
      return{...c,days,revenue:days*c.rate+c.mob+c.demob};
    });
  }

  const totalRev=contracts.reduce((s,c)=>s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob,0);
  const days_=form.start&&form.end?contractDays(form.start,form.end):0;
  const preview=days_*(+form.rate||0)+(+form.mob||0)+(+form.demob||0);

  const F=({label,fkey,type,ph,half})=>(
    <div style={{marginBottom:12,flex:half?1:"unset"}}>
      <div style={{fontSize:11,color:"#94a3b8",marginBottom:3}}>{label}</div>
      <input type={type} value={form[fkey]} placeholder={ph}
        onChange={e=>setForm(f=>({...f,[fkey]:e.target.value}))}
        style={{width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid #334155",
          background:"#0f172a",color:"#e2e8f0",fontSize:13,boxSizing:"border-box"}}/>
    </div>
  );

  return (
    <div style={{fontFamily:"Arial,sans-serif",background:"#0f172a",minHeight:"100vh",color:"#e2e8f0"}}>
      <div style={{background:"#1e293b",borderBottom:"1px solid #334155",padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:18,fontWeight:700,color:"#38bdf8"}}>⚓ Флот МСС — {YEAR}</span>
        <span style={{fontSize:12,color:"#475569"}}>{vessels.length} судов · {contracts.length} контрактов</span>
        <span style={{marginLeft:"auto",fontSize:13}}>Выручка: <b style={{color:"#4ade80"}}>{fmoney(totalRev)}</b></span>
      </div>

      <div style={{display:"flex",background:"#1e293b",borderBottom:"1px solid #334155",padding:"8px 16px 0"}}>
        {[["gantt","📊 Ганта"],["economics","💰 Экономика"],["vessels","🚢 Суда"]].map(([k,l])=>(
          <button key={k} onClick={()=>setActiveTab(k)} style={{
            padding:"7px 16px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,marginRight:4,
            background:activeTab===k?"#0f172a":"transparent",
            color:activeTab===k?"#38bdf8":"#64748b",
            borderBottom:activeTab===k?"2px solid #38bdf8":"2px solid transparent"
          }}>{l}</button>
        ))}
      </div>

      <div style={{padding:16}}>
        {(activeTab==="gantt"||activeTab==="economics")&&(
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
            {allTypes.map(t=>(
              <button key={t} onClick={()=>setFilterType(t)} style={{
                padding:"4px 12px",borderRadius:20,border:"1px solid",cursor:"pointer",fontSize:12,fontWeight:600,
                borderColor:filterType===t?"#38bdf8":"#334155",
                background:filterType===t?"#38bdf8":"transparent",
                color:filterType===t?"#0f172a":"#94a3b8"
              }}>{t}</button>
            ))}
          </div>
        )}

        {activeTab==="gantt"&&(
          <div>
            {cpList.length>0&&(
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {cpList.map(cp=>(
                  <div key={cp} style={{display:"flex",alignItems:"center",gap:5,background:"#1e293b",padding:"2px 10px",borderRadius:20,fontSize:11}}>
                    <div style={{width:9,height:9,borderRadius:2,background:colorMap[cp]}}/>{cp}
                  </div>
                ))}
              </div>
            )}
            <div style={{display:"flex",marginLeft:190,marginBottom:2}}>
              {MONTHS.map((m,i)=>{
                const d=new Date(YEAR,i+1,0).getDate();
                return <div key={m} style={{width:`${(d/totalDays)*100}%`,textAlign:"center",fontSize:10,color:"#475569",borderLeft:"1px solid #1e293b"}}>{m}</div>;
              })}
            </div>
            {filtered.map(v=>{
              const vc=contracts.filter(c=>c.vesselId===v.id);
              return(
                <div key={v.id} style={{display:"flex",alignItems:"center",marginBottom:5}}>
                  <div style={{width:190,flexShrink:0,fontSize:11,color:"#cbd5e1",paddingRight:8,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={v.name}>{v.name}</div>
                  <div style={{flex:1,height:30,background:"#1e293b",borderRadius:4,position:"relative",border:"1px solid #334155",cursor:"pointer"}} onClick={()=>openAdd(v.id)}>
                    {MONTHS.map((_,i)=>{const off=(new Date(YEAR,i,1)-yearStart)/86400000;return <div key={i} style={{position:"absolute",left:`${(off/totalDays)*100}%`,top:0,bottom:0,width:1,background:"#334155",pointerEvents:"none"}}/>;
                    })}
                    {vc.map(c=>{
                      const left=(dayOffset(c.start)/totalDays)*100;
                      const width=(contractDays(c.start,c.end)/totalDays)*100;
                      const color=colorMap[c.counterparty]||COLORS[0];
                      return(
                        <div key={c.id} title={`${c.counterparty}\n${c.start} → ${c.end}\n${fmoney(c.rate)}/сут`}
                          onClick={e=>{e.stopPropagation();openEdit(c);}}
                          style={{position:"absolute",left:`${left}%`,width:`${Math.max(width,0.4)}%`,
                            top:3,bottom:3,background:color,borderRadius:3,cursor:"pointer",
                            display:"flex",alignItems:"center",overflow:"hidden",
                            fontSize:10,fontWeight:600,color:"#fff",paddingLeft:5,
                            boxShadow:"0 1px 4px rgba(0,0,0,0.5)"}}>
                          <span style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.counterparty}</span>
                        </div>
                      );
                    })}
                    {vc.length===0&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",paddingLeft:8,fontSize:10,color:"#334155"}}>+ добавить контракт</div>}
                  </div>
                  <button onClick={()=>openAdd(v.id)} style={{marginLeft:5,width:22,height:22,borderRadius:4,border:"1px solid #334155",background:"#1e293b",color:"#38bdf8",cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>+</button>
                </div>
              );
            })}
            <div style={{fontSize:10,color:"#334155",marginTop:6}}>Нажмите строку или «+» для добавления · Нажмите блок для редактирования</div>
          </div>
        )}

        {activeTab==="economics"&&(
          <div>
            {filtered.map(v=>{
              const ec=econ(v.id);
              const tot=ec.reduce((s,c)=>s+c.revenue,0);
              return(
                <div key={v.id} style={{background:"#1e293b",borderRadius:8,padding:12,marginBottom:10,border:"1px solid #334155"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#38bdf8",marginBottom:8}}>{v.name}</div>
                  {ec.length===0?<div style={{color:"#334155",fontSize:11}}>Нет контрактов</div>:(
                    <>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                        <thead><tr style={{color:"#475569",borderBottom:"1px solid #334155"}}>
                          {["Контрагент","Начало","Конец","Дней","Ставка/сут","Моб","Демоб","Выручка"].map(h=><th key={h} style={{textAlign:"left",padding:"3px 5px"}}>{h}</th>)}
                        </tr></thead>
                        <tbody>{ec.map(c=>(
                          <tr key={c.id} style={{borderBottom:"1px solid #0f172a"}}>
                            <td style={{padding:"4px 5px"}}><span style={{display:"inline-block",width:8,height:8,borderRadius:2,background:colorMap[c.counterparty]||"#888",marginRight:4}}/>{c.counterparty}</td>
                            <td style={{padding:"4px 5px",color:"#64748b"}}>{c.start}</td>
                            <td style={{padding:"4px 5px",color:"#64748b"}}>{c.end}</td>
                            <td style={{padding:"4px 5px"}}>{c.days}</td>
                            <td style={{padding:"4px 5px"}}>{fmoney(c.rate)}</td>
                            <td style={{padding:"4px 5px"}}>{fmoney(c.mob)}</td>
                            <td style={{padding:"4px 5px"}}>{fmoney(c.demob)}</td>
                            <td style={{padding:"4px 5px",color:"#4ade80",fontWeight:700}}>{fmoney(c.revenue)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                      <div style={{textAlign:"right",marginTop:5,fontSize:12,fontWeight:700,color:"#4ade80"}}>Итого: {fmoney(tot)}</div>
                    </>
                  )}
                </div>
              );
            })}
            {totalRev>0&&<div style={{background:"#0f172a",border:"1px solid #38bdf8",borderRadius:8,padding:12,textAlign:"center",fontSize:16,fontWeight:700,color:"#38bdf8"}}>ИТОГО ПО ФЛОТУ: {fmoney(totalRev)}</div>}
          </div>
        )}

        {activeTab==="vessels"&&(
          <div>
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addV()} placeholder="Название нового судна..."
                style={{flex:1,padding:"8px 12px",borderRadius:6,border:"1px solid #334155",background:"#1e293b",color:"#e2e8f0",fontSize:13}}/>
              <button onClick={addV} style={{padding:"8px 16px",borderRadius:6,border:"none",background:"#38bdf8",color:"#0f172a",fontWeight:700,cursor:"pointer"}}>+ Добавить</button>
            </div>
            {typeOrder.map(type=>{
              const grp=vessels.filter(v=>getType(v.name)===type);
              if(!grp.length)return null;
              return(
                <div key={type} style={{marginBottom:14}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#475569",marginBottom:5,letterSpacing:1}}>{type}</div>
                  {grp.map(v=>(
                    <div key={v.id} style={{display:"flex",alignItems:"center",background:"#1e293b",borderRadius:6,padding:"9px 12px",marginBottom:4,border:"1px solid #334155"}}>
                      <span style={{marginRight:8}}>🚢</span>
                      <span style={{flex:1,fontSize:12}}>{v.name}</span>
                      <span style={{color:"#475569",fontSize:11,marginRight:10}}>{contracts.filter(c=>c.vesselId===v.id).length} контр.</span>
                      <button onClick={()=>delV(v.id)} style={{padding:"2px 8px",borderRadius:4,border:"1px solid #ef4444",background:"transparent",color:"#ef4444",cursor:"pointer",fontSize:11}}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
          <div style={{background:"#1e293b",borderRadius:10,padding:22,width:430,border:"1px solid #334155",boxShadow:"0 20px 60px rgba(0,0,0,0.6)"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#38bdf8",marginBottom:4}}>{editId?"✏️ Редактировать контракт":"➕ Новый контракт"}</div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:14}}>{vessels.find(v=>v.id===activeVessel)?.name}</div>
            <F label="Контрагент" fkey="counterparty" type="text" ph="Название компании"/>
            <div style={{display:"flex",gap:10}}><F label="Начало" fkey="start" type="date" half/><F label="Конец" fkey="end" type="date" half/></div>
            <F label="Суточная ставка (₽)" fkey="rate" type="number" ph="0"/>
            <div style={{display:"flex",gap:10}}><F label="Мобилизация (₽)" fkey="mob" type="number" ph="0" half/><F label="Демобилизация (₽)" fkey="demob" type="number" ph="0" half/></div>
            {days_>0&&<div style={{background:"#0f172a",borderRadius:6,padding:"7px 10px",marginBottom:12,fontSize:11,color:"#4ade80"}}>📊 {days_} дней · Выручка: <b>{fmoney(preview)}</b></div>}
            <div style={{display:"flex",gap:8}}>
              <button onClick={save} style={{flex:1,padding:9,borderRadius:6,border:"none",background:"#38bdf8",color:"#0f172a",fontWeight:700,cursor:"pointer",fontSize:13}}>{editId?"Сохранить":"Добавить"}</button>
              {editId&&<button onClick={()=>delC(editId)} style={{padding:"9px 12px",borderRadius:6,border:"1px solid #ef4444",background:"transparent",color:"#ef4444",cursor:"pointer"}}>Удалить</button>}
              <button onClick={()=>setShowForm(false)} style={{padding:"9px 12px",borderRadius:6,border:"1px solid #334155",background:"transparent",color:"#94a3b8",cursor:"pointer"}}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
