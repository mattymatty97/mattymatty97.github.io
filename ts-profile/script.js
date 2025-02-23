document.addEventListener('DOMContentLoaded', async function () {
    const cacheVersion = 1;
    await deleteOldCaches();

    const fetchInterval = 100;
    const fetchIntervalLong = 60 * 1000;

    const proxyUrl = "https://corsproxy.io/?url=";
    const thunderstoreUrl = "https://thunderstore.io/";
    const getProfileUrl = (id) => `${thunderstoreUrl}api/experimental/legacyprofile/get/${id}/`;
    const getPackageUrl = (namespace, name) => `${thunderstoreUrl}api/experimental/package/${namespace}/${name}/`;
    const getRequestUrl = (endpoint) =>  `${proxyUrl}${encodeURIComponent(endpoint)}`;

    const form = document.getElementById('profileForm');
    const uuidInput = document.getElementById('uuidInput');
    const statusMessage = document.getElementById('status-message');
    const parsedDataContainer = document.getElementById('parsed-data');

    const queryParams = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });

    // Add viewport meta for proper mobile scaling
    if (!document.querySelector('meta[name="viewport"]')) {
        const meta = document.createElement('meta');
        meta.name = 'viewport';
        meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        document.head.appendChild(meta);
    }

    // Handle mobile keyboard appearing/disappearing
    window.addEventListener('resize', () => {
        // Wait for keyboard animation
        setTimeout(() => {
            window.scrollTo(0, 0);
            document.body.scrollTop = 0;
        }, 100);
    });

    form.addEventListener('submit', async function (event) {
        event.preventDefault();

        // Blur input to hide mobile keyboard
        uuidInput.blur();

        const uuid = uuidInput.value.trim();

        await getProfile(uuid);
    });

    if (queryParams.profile) {
        uuidInput.value = queryParams.profile;
        uuidInput.blur();
        await getProfile(queryParams.profile);
    }

    async function getProfile(uuid) {
        statusMessage.classList.remove("error-message", "success-message");
        statusMessage.textContent = 'Fetching profile...';
        parsedDataContainer.innerHTML = '';
        parsedDataContainer.classList.remove("parsed-data");

        if (!uuid) {
            statusMessage.classList.add("error-message");
            statusMessage.textContent = 'Please enter a UUID.';
            return;
        }

        try {
            const response = await fetchProfileData(uuid);
            if (!response.ok) {
                throw new Error('Failed to fetch profile.');
            }

            const yamlData = response.json();
            parsedDataContainer.classList.add("parsed-data");

            // Create mobile-friendly profile container
            const profileContainer = createProfileContainer(uuid, yamlData);
            parsedDataContainer.appendChild(profileContainer);

            // Handle mods display
            if (yamlData.mods?.length > 0) {
                await displayMods(yamlData.mods, parsedDataContainer);
            } else {
                const noMods = document.createElement('p');
                noMods.textContent = 'No mods found.';
                parsedDataContainer.appendChild(noMods);
            }

            // Add download handler
            document.getElementById('download-btn').addEventListener('click', function () {
                saveAs(response.blob(), `${yamlData.profileName}.zip`);
            });

            statusMessage.classList.add("success-message");
            statusMessage.textContent = 'Profile fetched successfully.';

            // Smooth scroll to results on mobile
            if (window.innerWidth <= 768) {
                parsedDataContainer.scrollIntoView({behavior: 'smooth'});
            }
        } catch (error) {
            statusMessage.classList.add("error-message");
            statusMessage.textContent = error.message;
        }
    }

    async function displayMods(mods, container) {
        const modsParagraph = document.createElement('h3');
        modsParagraph.innerHTML = `Mods (${mods.length}):`;
        container.appendChild(modsParagraph);
        container.appendChild(document.createElement('br'));

        // Use Promise.all for parallel mod fetching
        const modPromises = mods.map(mod => createModElement(mod));
        const modElements = await Promise.all(modPromises);
        modElements.forEach(element => container.appendChild(element[0]));
        for (const element of modElements) {
            const mod = element[1];
            const callback = element[2];
            try {
                const [namespace, name] = mod.name.split('-');
                const endpoint = getPackageUrl(namespace, name);

                const cachedData = await fetchCachedData(endpoint);

                if (cachedData){
                    callback(cachedData);
                    continue;
                }

                await sleep(fetchInterval);

                let [valid, response] = await fetchLiveData(endpoint);

                if (!valid && response != null && response.status === 403) {

                    const header = response.headers.get('retry-after');
                    let delay = fetchIntervalLong;
                    if (header) {
                        delay = header * 1000;
                    }

                    console.warn(`Rate-limit hit, throttling for: ${delay}ms!`)

                    await sleep(delay);

                    [valid, response] = await fetchLiveData(endpoint);
                }

                if (valid && response != null) {
                    const data = await response.json();
                    updateCachedData(endpoint, Date.now(), data);
                    callback(data);
                }else{
                    console.error(`Failed to fetch mod: ${mod.name}`);
                }

            } catch (error) {
                console.error(`Error fetching data for ${mod.name}:`, error);
            }
        }
    }

    async function fetchCachedData(endpoint) {
        const storage = window.localStorage;
        const cachedResponse = storage.getItem(endpoint);

        if (cachedResponse == null) {
            return false;
        }

        const cachedJson = JSON.parse(cachedResponse);

        const date = new Date(cachedJson.timestamp)
        // if cached file is older than 1 hour
        if(Date.now() > date.getTime() + 1000 * 60 * 60){
            return false;
        }

        console.log(`Cache hit for: ${endpoint}`)

        return cachedJson.data;
    }

    function updateCachedData(endpoint, timestamp, data) {
        const storage = window.localStorage;
        storage[endpoint] = JSON.stringify({ timestamp: timestamp, data: data });
    }

    async function deleteOldCaches() {
        const storage = window.localStorage;
        const storageVersion = storage.version;
        if (storageVersion < cacheVersion) {
            storage.clear();
        }else{
            const keys = Object.keys(storage);
            for (const key of keys) {
                if (key === 'version')
                    continue;

                const cachedResponse = JSON.parse(storage.getItem(key));

                const date = new Date(cachedResponse.timestamp)
                // if cached file is older than 1 hour
                if(Date.now() > date.getTime() + 1000 * 60 * 60){
                    storage.removeItem(key);
                }
            }
        }
        storage.version = cacheVersion;
    }

    async function fetchLiveData(endpoint) {
        return fetch(getRequestUrl(endpoint))
            .then(res => {
                if (res.ok)
                    return [true, res];
                else
                    return [false, res];
            }).catch((error) => {
                console.error(error);
                return [false, null];
            });
    }

    function createProfileContainer(uuid, yamlData) {
        const container = document.createElement('div');
        container.className = 'profile-container';

        const content = document.createElement('div');
        content.className = 'profile-content';

        content.innerHTML = `
            <p><strong>Uuid:</strong> ${uuid}</p>
            <p><strong>From:</strong> ${yamlData.source}</p>
            <h2>${yamlData.profileName}</h2>
        `;

        const downloadBtn = document.createElement('button');
        downloadBtn.id = 'download-btn';
        downloadBtn.className = 'download-btn';
        downloadBtn.textContent = 'Download As Archive';

        container.appendChild(content);
        container.appendChild(downloadBtn);

        return container;
    }

    async function createModElement(mod) {
        const modContainer = document.createElement('div');
        modContainer.className = 'mod-container';

        const modContent1 = document.createElement('div');
        modContent1.className = 'mod-content1';

        const modContent2 = document.createElement('div');
        modContent2.className = 'mod-content2';

        const modHeader = createModHeader(mod);

        modContent2.appendChild(modHeader);

        const modIcon = document.createElement('img');
        modIcon.classList.add('mod-icon', 'missing-icon');
        modIcon.src = 'image.svg';
        modIcon.alt = 'Mod Icon';
        modIcon.loading = 'lazy';

        modContent1.appendChild(modIcon);
        modContent1.appendChild(modContent2);

        modContainer.appendChild(modContent1);

        return [modContainer, mod, (data) => enhanceModElement(modContent2, modIcon, modHeader, data)];
    }


    function createModHeader(mod) {
        const header = document.createElement('div');
        header.className = 'mod-header';

        const nameElement = document.createElement('div');
        nameElement.innerText = mod.name;
        if (!mod.enabled) {
            nameElement.className = 'disabled-mod';
        }

        const enabledParagraph = document.createElement('p');
        enabledParagraph.innerHTML = `<br><strong>Enabled:</strong> ${mod.enabled ? 'Yes' : 'No'}`;

        const versionParagraph = document.createElement('p');
        versionParagraph.innerHTML = `<strong>Version:</strong> ${mod.version.major}.${mod.version.minor}.${mod.version.patch}`;

        header.appendChild(nameElement);
        header.appendChild(enabledParagraph);
        header.appendChild(versionParagraph);

        return header;
    }

    async function enhanceModElement(modContent, modIcon, modHeader, data) {
        if (data.latest?.icon) {
            modIcon.src = data.latest.icon;
            modIcon.classList.remove('missing-icon');
        }

        if (data.is_deprecated) {
            const deprecatedParagraph = document.createElement('p');
            deprecatedParagraph.innerHTML = '<strong>Deprecated:</strong> Yes';
            modHeader.appendChild(deprecatedParagraph);

            const warningIcon = document.createElement('img');
            warningIcon.src = 'warning.png';
            warningIcon.alt = 'Warning';
            warningIcon.className = 'warning-icon';
            warningIcon.loading = 'lazy';
            modContent.appendChild(warningIcon);
        }
    }

    function fetchProfileData(uuid) {
        const endpoint = getProfileUrl(uuid);

        return new Promise(async (resolve, reject) => {

            fetchLiveData(endpoint)
                .then(([valid, response]) => {
                    if (!valid) {
                        if (response!=null && response.status === 403) {
                            const header = response.headers.get('retry-after');
                            if (header) {
                                throw new Error(`Rate-limit hit, retry in ${header}s`);
                            }else{
                                throw new Error(`Rate-limit hit, retry in 60s`);
                            }
                        }
                        throw new Error(`Failed to fetch profile`);
                    }
                    return response.blob();
                })
                .then(blob => readBlobAsText(blob))
                .then(text => {
                    // Find the position of the first newline
                    const firstNewlinePos = text.indexOf('\n');
                    if (firstNewlinePos === -1) {
                        reject(new Error("Invalid data format"));
                    }
                    // Extract the base64 encoded zip file part
                    const base64Data = text.substring(firstNewlinePos + 1);
                    // Convert base64 to a Blob and then to an ArrayBuffer
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const arrayBuffer = byteArray.buffer;
                    // Create a Blob from the ArrayBuffer
                    const zipBlob = new Blob([arrayBuffer], {type: 'application/zip'});
                    JSZip.loadAsync(zipBlob).then(function (zip) {
                        resolve(processZip(zipBlob, zip));
                    }).catch(err => {
                        reject(new Error(`Failed to load zip: ${err.message}`));
                    });
                })
                .catch(error => {
                    reject(new Error(`Failed to fetch profile: ${error.message}`));
                });
        });
    }

    function processZip(blob, zip) {
        return new Promise((resolve, reject) => {
            // Check if the export.r2x file exists in the root of the zip
            const exportR2X = zip.file('export.r2x');
            if (!exportR2X) {
                reject(new Error("File 'export.r2x' not found in the zip."));
                return;
            }

            // Read and parse the content of export.r2x
            exportR2X.async('string').then(content => {
                try {
                    const parsedData = jsyaml.load(content);
                    resolve({
                        ok: true,
                        json: () => parsedData,
                        blob: () => blob
                    });
                } catch (e) {
                    reject(new Error("Failed to parse YAML: " + e.message));
                }
            }).catch(reject);
        });
    }

    function readBlobAsText(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                resolve(reader.result);
            };
            reader.onerror = reject;
            reader.readAsText(blob);
        });
    }

    async function sleep(timeout){
        await new Promise(resolve => setTimeout(resolve, timeout));
    }
});