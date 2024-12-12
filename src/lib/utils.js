export function isAuthorized(user, config) {
  const freeAccess = config.allowedProviders.length === 1 && config.allowedProviders[0] === "*" && config.allowedUsers.length === 1 && config.allowedUsers[0] === "*"
  return freeAccess
    || (config.allowedUsers.length === 1 && config.allowedUsers[0] === "*" && !!user?.uri)
    || config.allowedUsers.includes(user?.uri) 
    || !!config.allowedProviders.find(provider => user?.identities[provider]?.id)
}
