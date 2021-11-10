const URL_HEADER = 'WannabeURL',
      IP_HEADER  = 'WannabeIP',
      TOKEN      = {
          key: 'WannabeToken',
          value: '' // WARNING: Change this in order to be able to perform your request.
      };

/**
 * Credit to emix https://stackoverflow.com/a/53815921/13158114
 * @type {{random: (function(*=, *): *), lon2ip: (function(*): string), ip2lon: (function(*))}}
 */
const ipv4 = {
    random: function (subnet, mask) {
        // generate random address (integer)
        // if the mask is 20, then it's an integer between
        // 1 and 2^(32-20)
        let randomIp = Math.floor(Math.random() * Math.pow(2, 32 - mask)) + 1;

        return this.lon2ip(this.ip2lon(subnet) | randomIp);
    },
    ip2lon: function (address) {
        let result = 0;

        for (const octet of address.split('.')) {
            result <<= 8;
            result += Number.parseInt(octet, 10);
        }

        return result >>> 0;
    },
    lon2ip: function (lon) {
        return [lon >>> 24, lon >> 16 & 255, lon >> 8 & 255, lon & 255].join('.');
    }
};

/**
 * Pretty neat bracketless fetch promise.
 * @param url
 * @param init
 * @returns {Promise<RequestInfo>}
 * @constructor
 */
const REQUEST = async (url, init) => new Promise((resolve, reject) => fetch(url, init)
    .then(response => response.clone())
    .then(cloned_response => resolve(cloned_response))
    .catch(error => reject(error))
);

/**
 * Proxy our original request.
 * @param request
 * @returns {Promise<Response>}
 */
const proxyRequest = async (request) => {
    if (request.headers.get(TOKEN.key) !== TOKEN.value) {
        return new Response('', {
            status: 403,
            statusText: 'Forbidden',
        });
    }

    let newHeaders = new Headers()
    for (const [key, value] of request.headers) {
        let smollKey = key.toLowerCase();

        // Remove optional headers from the request
        if (smollKey === TOKEN.key.toLowerCase() || // Check for password to prevent unwanted usage
            smollKey === URL_HEADER.toLowerCase() ||
            smollKey === IP_HEADER.toLowerCase() ||
            smollKey.startsWith('cf-') ||
            smollKey === 'x-forwarded-for' ||
            smollKey === 'x-real-ip'
        ) continue;

        // Set the sent header to our new headers
        newHeaders.set(key, value)
    }

    const ip       = request.headers.get(IP_HEADER) || ipv4.random('70.0.0.0', 4), // In case not set generate random ip
          url      = request.headers.get(URL_HEADER),
          hostname = new URL(url).hostname;

    newHeaders.set('Host', hostname);
    newHeaders.set('X-Real-Ip', ip);
    newHeaders.set('X-Forwarded-For', ip);

    // Proxy our request
    let response = await REQUEST(url, {
        body: request.body,
        headers: newHeaders,
        method: request.method
    });

    // For some reason Cloudflare only support responses between these ranges.
    let responseStatus = 200;
    if (response.status >= 200 && response.status <= 599) {
        responseStatus = response.status;
    }

    // Finally return proxy response
    return new Response(response.body, {
        status: responseStatus,
        statusText: response.statusText,
        headers: response.headers
    });
}

// Waiting for event...
addEventListener('fetch', event => event.respondWith(proxyRequest(event.request)));
