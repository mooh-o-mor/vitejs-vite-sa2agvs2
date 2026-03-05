import type { Vessel, Contract } from "../lib/types";
import { COLORS, SPECIAL_COLORS, T } from "../lib/types";
import { cpKey, contractDays, fmoney, fdate } from "../lib/utils";

interface Props {
  vessels: Vessel[];
  contracts: Contract[];
}

export function Economics({ vessels, contracts }: Props) {
  const cpKeys = [...new Set(contracts.map(c => cpKey(c.counterparty)))];
  const colorMap: Record<string,string> = Object.fromEntries(
    cpKeys.map((cp,i) => [cp, SPECIAL_COLORS[cp]||COLORS[i%COLORS.length]])
  );

  const totalRev = contracts
    .filter(c => vessels.some(v => v.id===c.vesselId))
    .reduce((s,c) => s+contractDays(c.start,c.end)*c.rate+c.mob+c.demob, 0);

  return (
    <div>
      {vessels.map(v => {
        const ec = contracts.filter(c => c.vesselId===v.id).map(c => {
          const days = contractDays(c.start, c.end);
          return { ...c, days, revenue: days*c.rate+c.mob+c.demob };
        });
        const tot = ec.reduce((s,c) => s+c.revenue, 0);
        return (
          <div key={v.id} style={{ background:T.bg2, borderRadius:8, padding:12, marginBottom:10, border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.accent, marginBottom:6 }}>
              {v.name}
              {v.branch && <span style={{ color:T.amber, fontWeight:400, fontSize:11, marginLeft:8 }}>{v.branch}</span>}
            </div>
            {ec.length===0 ? (
              <div style={{ color:T.text3, fontSize:11 }}>Нет контрактов</div>
            ) : (
              <>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                  <thead>
                    <tr style={{ color:T.text2, borderBottom:`1px solid ${T.border}`, background:T.bg3 }}>
                      {["Контрагент","Начало","Конец","Тв.дней","Опц.дней","Всего","Ставка/сут","Моб","Демоб","Выручка"].map(h => (
                        <th key={h} style={{ textAlign:"left", padding:"4px 6px" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ec.map((c,i) => (
                      <tr key={c.id} style={{ borderBottom:`1px solid ${T.border2}`, background:i%2===0?T.bg2:T.bg3 }}>
                        <td style={{ padding:"4px 6px" }}>
                          <span style={{ display:"inline-block", width:8, height:8, borderRadius:2, background:colorMap[cpKey(c.counterparty)]||"#888", marginRight:4 }}/>
                          {c.counterparty}
                        </td>
                        <td style={{ padding:"4px 6px", color:T.text2 }}>{fdate(c.start)}</td>
                        <td style={{ padding:"4px 6px", color:T.text2 }}>{fdate(c.end)}</td>
                        <td style={{ padding:"4px 6px" }}>{c.firmDays||"—"}</td>
                        <td style={{ padding:"4px 6px" }}>{c.optionDays||"—"}</td>
                        <td style={{ padding:"4px 6px" }}>{c.days}</td>
                        <td style={{ padding:"4px 6px" }}>{fmoney(c.rate)}</td>
                        <td style={{ padding:"4px 6px" }}>{fmoney(c.mob)}</td>
                        <td style={{ padding:"4px 6px" }}>{fmoney(c.demob)}</td>
                        <td style={{ padding:"4px 6px", color:T.green, fontWeight:700 }}>{fmoney(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ textAlign:"right", marginTop:5, fontSize:12, fontWeight:700, color:T.green }}>Итого: {fmoney(tot)}</div>
              </>
            )}
          </div>
        );
      })}
      {totalRev>0 && (
        <div style={{ background:T.accent, borderRadius:8, padding:12, textAlign:"center", fontSize:16, fontWeight:700, color:"#ffffff" }}>
          ИТОГО ПО ФЛОТУ: {fmoney(totalRev)}
        </div>
      )}
    </div>
  );
}
