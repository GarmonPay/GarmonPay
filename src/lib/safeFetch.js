export async function safeFetch(fn){
  try{
    return await fn()
  }catch(e){
    console.error("SafeFetch Error:", e)
    return null
  }
}
