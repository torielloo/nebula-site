import moment from "moment";
import "moment/locale/pt-br";

moment.locale("pt-br");

// O servidor salva as datas em UTC. Strings ISO que chegam sem indicação de
// fuso (sem "Z" ou offset) eram interpretadas como horário local, exibindo
// horas e até dias errados — aqui normalizamos: sem fuso = UTC.
export const parseDate = (value) => {
  if (moment.isMoment(value)) return value;
  if (value === null || value === undefined || value === "") return moment.invalid();
  let s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    s = s.replace(" ", "T") + "Z";
  }
  return moment(s);
};

export const formatLocalDateTime = (value, opts = {}) => {
  const d = parseDate(value);
  if (!d.isValid()) return "";
  const date = d.toDate();
  const locale = typeof navigator !== "undefined" && navigator.language ? navigator.language : "pt-BR";
  // Sem timeZone explícito: Intl usa automaticamente o fuso configurado no
  // dispositivo/navegador do usuário. Assim a mesma data UTC é exibida na hora local correta.
  if (opts.dateStyle || opts.timeStyle) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: opts.dateStyle || "short",
      timeStyle: opts.timeStyle || "medium",
    }).format(date);
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

export const formatLocalTime = (value) => {
  const d = parseDate(value);
  if (!d.isValid()) return "";
  return new Intl.DateTimeFormat(navigator.language || "pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d.toDate());
};

export { moment };