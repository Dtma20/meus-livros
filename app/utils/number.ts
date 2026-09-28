export function formatThousands(num: number): string {
  const str = Math.trunc(Math.abs(num)).toString()
  const formatted = str.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return num < 0 ? `-${formatted}` : formatted
}
