var app = {};
var BASE_URL = 'https://api-jp.kii.com/api';

var Context = Backbone.Model.extend({
    url : BASE_URL + '/oauth2/token',
    createHeader : function(contentType, hasAuth) {
        var headers = {
            'x-kii-appid' : '7c1b0f46',
            'x-kii-appkey' : 'b13521a595a0df19aa9f67fb0966218f',
        };
        if (contentType != null) {
            headers['content-type'] = contentType;
        }
        if (hasAuth) {
            headers.authorization = 'bearer ' + this.get('access_token');
        }
        return headers;
    },
    isLoggedIn : function() {
        var token = this.get('access_token');
        return token != null && token.length > 0;
    },
    login : function(username, password, success, failed) {
        var c = this;
        this.save({
            'username' : username,
            'password' : password
        }, {
            headers : this.createHeader('application/json', false),
            success : function() {
                success(c);
            },
            error : function() {
                failed();
            }
       });
    }
});

var Memo = Backbone.Model.extend({
    urlRoot : BASE_URL +  '/apps/7c1b0f46/users/me/buckets/memo/objects',
    idAttribute: "_id",
    del : function(callback) {
        var c = this;
        this.destroy({
            headers : context.createHeader(null, true),
            success : function() {
                callback.success();
            }            
        });
    }
});

var MemoList = Backbone.Collection.extend({
    model : Memo,
    urlRoot : BASE_URL +  '/apps/7c1b0f46/users/me/buckets/memo/objects',
    comparator : function(left, right) {
        var leftTime = left.get('_modified');
        var rightTime = right.get('_modified');
        if (leftTime == null) { leftTime = left.get('_created'); }
        if (rightTime == null) { rightTime = right.get('_created'); }
        console.log(left.get('title') + leftTime + " / " + rightTime + right.get('title'));
        return leftTime < rightTime ? 1 : leftTime > rightTime ? -1 : 0;
    },
    createMemo : function(title, contents, success) {
        var c = this;
        this.create({
            'title' : title,
            'contents' : contents
        }, {
            headers : context.createHeader('application/json', true),
            success : function(resp) {
                resp.set('_id', resp.get('objectID'));
                resp.set('_modified', resp.get('createdAt'));
                c.sort();
                success(c);
            }
       });
    },    
    getAll : function(done) {
        var list = this;
        this.fetch({
            headers : context.createHeader('application/vnd.kii.QueryRequest+json', true),
            type : "POST",
            data : '{"bucketQuery":{"clause":{"type":"all"},"orderBy":"_modified","descending":true}}',
            url : BASE_URL +  '/apps/7c1b0f46/users/me/buckets/memo/query',
            success : function() {
                list.sort();
                done(list);
            }
        });
    },
    parse : function(resp) {
        return resp.results;
    }
});

var TitleView = Backbone.View.extend({
    el : '#container',
    template : _.template($("#layout_title").html()),
    events : {
        "click #button_login" : "onLogin"
    },
    initialize : function () {
        _.bindAll(this, 'onLogin');
    },
    onLogin : function() {
        var username = $('#username').val();
        var password = $('#password').val();
        var view = this;
        $('#button_login').attr('disabled', true);
        context.login(username, password, function(context) {
            app.memoList.getAll(function(list){
                app.router.navigate("top", {trigger:true});                
            });
        }, function() {
            $('#button_login').removeAttr('disabled');
        });
    },
    render : function() {
        this.$el.html(this.template);
    }
});

var CreateView = Backbone.View.extend({
    el : '#container',
    template : _.template($("#layout_create").html()),
    events : {
        "click #button_create_memo" : "createMemo"
    },
    initialize : function () {
        _.bindAll(this, 'createMemo');
    },
    createMemo : function() {
        var title = $('#edit_title').val();
        var contents = $('#edit_contents').val();
        if (title.length == 0 || contents.length == 0) {
            return;
        }
        var view = this;
        var memo = new Memo();
        app.memoList.createMemo(title, contents, function() {
            history.back();
        });
    },
    render : function() {
        if (context.isLoggedIn()) {
            this.$el.html(this.template);
        } else {
            history.back();
        }
    }
});

var TopView = Backbone.View.extend({
    el : '#container',
    template : _.template($("#layout_top").html()),
    events : {
        "click #button_create" : "showCreate"
    },
    initialize : function () {
        _.bindAll(this, 'showCreate');
    },
    showCreate : function() {
        app.router.navigate("create", {trigger:true});
    },
    render : function() {
        if (context.isLoggedIn()) {
            this.$el.html(this.template);
            this.listView = new MemoListView();
            this.listView.rootView = this;
            this.listView.render();
        } else {
            history.back();
        }
    },
    showContents : function(contents) {
        $('#text_contents').html(contents);
    }
});

var MemoListView = Backbone.View.extend({
    el : '#listView',
    initialize : function () {
//        _.bindAll(this, '');
    },
    render : function() {
        var list = this;
        app.memoList.each(function(item){
            var cell = new MemoCell({model:item});
            cell.rootView = list.rootView;
            list.$el.append(cell.render().el);
        });
    }
});

var MemoCell = Backbone.View.extend({
    tagName : 'tr',
    template : _.template($("#layout_item_memo").html()),
    events : {
        "click #button_view" : "view",
        "click #button_delete" : "confirmDelete"
    },
    initialize : function () {
        _.bindAll(this, 'view', 'confirmDelete');
    },
    view : function() {
        this.rootView.showContents(this.model.escape('contents'));
    },
    confirmDelete : function() {
        if (!window.confirm('delete ' + this.model.escape('title'))) {
            return;
        }
        var c = this;
        this.model.del({
            success : function() {
                c.$el.remove();
            }
        });
    },
    render : function() {
        var json = {
            'title' : this.model.escape('title')
        };
        this.$el.html(this.template(json));
        return this;
    }
});


var AppRounter = Backbone.Router.extend({
    routes : {
        "" : "title",
        "top" : "top",
        "create" : "create"
    },
    initialize : function() {
        _.bindAll(this, 'title');
        this.titleView = new TitleView();
        this.topView = new TopView();
        this.createView = new CreateView();
    },
    title : function() {
        this.titleView.render();
    },
    top : function() {
        this.topView.render();
    },
    create : function() {
        this.createView.render();
    }    
});

var context = new Context();
$(function() {
    app.memoList = new MemoList();
    app.router = new AppRounter();
    Backbone.history.start();
});

