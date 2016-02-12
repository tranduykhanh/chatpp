let Const = require("../helpers/Const.js");
let common = require("../helpers/Common.js");
let Storage = require("../helpers/Storage.js");
let EmoStorage = require("../helpers/EmoStorage.js");
let ChromeStorageLocal = require("../helpers/ChromeStorageLocal.js");

let storage = new Storage();
let emo_storage = new EmoStorage();
let emoticons = [];
let emo_info = {};
let urls = {};

init(true);

function init(inject_script) {
    storage.get(Const.CHROME_SYNC_KEY, function(info) {
        emo_info = info;
        if (!$.isEmptyObject(info)) {
            for (let key in info) {
                var emo_data = info[key];
                var url = common.getEmoticonDataUrl(emo_data.data_name, emo_data.data_url);
                if (url) {
                    urls[emo_data.data_name] = url;
                }
            }
        }
        if ($.isEmptyObject(urls)) {
            urls["Default"] = Const.DEFAULT_DATA_URL;
        }
        if (info === undefined) {
            info = {};
        }
        if (!info.force_update_version || info.force_update_version < Const.FORCE_TURN_OFF_THUMBNAIL) {
            info.force_update_version = Const.FORCE_TURN_OFF_THUMBNAIL;
            info.thumbnail_status = false;
            info.emoticon_status = true;
        }
        localStorage.force_update_version = info.force_update_version;
        var features = ["mention", "shortcut", "thumbnail", "highlight", "emoticon"];
        features.forEach(function(feature) {
            var feature_name = `${feature}_status`;
            if (info[feature_name] == false) {
                console.log(feature + " feature is disabled!");
            }
            info[feature_name] = info[feature_name] === undefined ? true : info[feature_name];
            common.setStatus(feature, info[feature_name]);
        });
        emo_storage.setFeatureStatus(info);
        if (info.emoticon_status == false) {
            addInjectedScript();
        } else {
            getData(info, inject_script);
        }
    });

    localStorage[Const.LOCAL_STORAGE_GROUP_MENTION] = [];
    storage.get(Const.CHROME_SYNC_GROUP_KEY, function(data) {
        if (!$.isEmptyObject(data)) {
            localStorage[Const.LOCAL_STORAGE_GROUP_MENTION] = JSON.stringify(data);
        }
    });

    localStorage[Const.LOCAL_STORAGE_ROOM_SHORTCUT] = [];
    storage.get(Const.CHROME_SYNC_ROOM_KEY, function(data) {
        if (!$.isEmptyObject(data)) {
            localStorage[Const.LOCAL_STORAGE_ROOM_SHORTCUT] = JSON.stringify(data);
        }
    });

    localStorage[Const.LOCAL_STORAGE_DISABLE_NOTIFY_ROOM] = [];
    storage.get(Const.CHROME_SYNC_DISABLE_NOTIFY_ROOM_KEY, function(data) {
        if (!$.isEmptyObject(data)) {
            localStorage[Const.LOCAL_STORAGE_DISABLE_NOTIFY_ROOM] = JSON.stringify(data);
        }
    });
}

function getData(info, inject_script) {
    var loaded_count = 0;
    var emo_count = common.getObjectLength(urls);
    var failed = false;
    localStorage.removeItem("failed_data");
    $.each(urls, function(data_name, url) {
        $.getJSON(url)
            .done(function(data) {
                if (typeof(data.data_version) !== "undefined" && typeof(data.emoticons) !== "undefined") {
                    data.data_url = urls[data.data_name];
                    var priority = (emo_info[data.data_name] && emo_info[data.data_name].priority) ? emo_info[data.data_name].priority : 0;
                    emo_storage.pushData(data, priority);
                    pushEmoticons(data.emoticons, priority, data.data_name);
                }
            }).fail(function(jqxhr, textStatus, error) {
                failed = true;
                delete emo_info[data_name];
                pushFailedData(data_name);
            }).always(function() {
                if (++loaded_count === emo_count) {
                    if (!failed) {
                        emo_storage.syncData();
                    }
                    var chrome_storage_local = new ChromeStorageLocal();
                    chrome_storage_local.get(function(local_data) {
                        var version_name = "";
                        if (!$.isEmptyObject(local_data)) {
                            version_name = local_data["version_name"];
                        }
                        var current_time = (new Date).toLocaleString();
                        console.log("You are using Chat++!. Date sync: " + current_time + ". Version: " + version_name);
                        localStorage[Const.LOCAL_STORAGE_DATA_KEY] = JSON.stringify(emoticons);
                        localStorage["chatpp_version_name"] = version_name;
                        localStorage["emoticon_data_version"] = parseDataName(emo_info);
                        if (inject_script !== undefined && inject_script) {
                            addInjectedScript();
                        } else {
                            // runFunction("reloadEmoticions()");
                        }
                    });
                }
            });
    });
}

function pushFailedData(data_name) {
    var data = localStorage["failed_data"] ? JSON.parse(localStorage["failed_data"]) : [];
    data.push(data_name);
    localStorage["failed_data"] = JSON.stringify(data);
}

function parseDataName(data) {
    if (data.data_name !== undefined && data.data_version !== undefined) {
        return data.data_name + "_" + data.data_version;
    }
    var data_name = "";
    for (let key in data) {
        if (data[key].data_name !== undefined) {
            data_name += data[key].data_name + "_" + data[key].data_version + "  ";
        }
    }
    return data_name;
}

function pushEmoticons(emos, priority, data_name) {
    for (var i = 0; i < emos.length; i++) {
        var repeated = false;
        emos[i].priority = priority;
        emos[i].data_name = data_name;
        for (var j = 0; j < emoticons.length; j++) {
            if (emoticons[j].key === emos[i].key) {
                if (emoticons[j].src !== emos[i].src && emoticons[j].priority < emos[i].priority) {
                    emoticons[j] = emos[i];
                }
                repeated = true;
                break;
            }
        }
        if (!repeated) {
            emoticons.push(emos[i]);
        }
    }
}

function addInjectedScript() {
    loadAdvertisement();
    preLoad();
    injectJsFile("internals/libs.js");
    injectCssFile("highlight.min.css");
    setTimeout(
        function() {
            injectJsFile("internals/all.js");
        }, Const.DELAY_TIME
    );

    setInterval(loadAdvertisement, Const.ADVERTISEMENT_LOAD_TIMEOUT);
}

function preLoad() {
    var text = '<li id="_chatppPreLoad"><span id="chatppPreLoad" class="icoSizeSmall"></span></li>';
    $("#_chatSendTool").append(text);
    var chatpp_pre_load = $("#chatppPreLoad");
    var delay_time = Const.DELAY_TIME / 1000;
    var pre_load_interval = setInterval(function() {
        if (--delay_time <= 0) {
            $("#_chatppPreLoad").remove();
            window.clearInterval(pre_load_interval);
        }
        var text = "Chat++ will be loaded in about " + delay_time + " second" + (delay_time > 1 ? "s" : "");
        chatpp_pre_load.html(text);
    }, 1000);
}

function injectJsFile(file_name) {
    var script = document.createElement("script");
    script.src = common.getExtensionPageUrl("js/" + file_name);
    (document.documentElement).appendChild(script);
}

function injectCssFile(file_name) {
    var css_link = $("<link>", {
        rel: "stylesheet",
        type: "text/css",
        href: common.getExtensionPageUrl("css/" + file_name)
    });
    css_link.appendTo("head");
}

function runFunction(func) {
    $("body").append($("<script />", {
        html: func
    }));
}

function loadAdvertisement() {
    $.getJSON(Const.ADVERTISEMENT_URL)
        .done(function(data) {
            if (!$.isEmptyObject(data)) {
                localStorage["chatpp_advertisement"] = JSON.stringify(data);
            }
        }).fail(function(jqxhr, textStatus, error) {
            var err = textStatus + ", " + error;
            console.log( "Load Ads Failed: " + err );
        });
}