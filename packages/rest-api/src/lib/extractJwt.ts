export function extractJwt(authorization: string) {
  let token = null;
  if (authorization && authorization.startsWith('Bearer ')) {
    token = authorization.split(' ')[1];
  }
  return token;
}
