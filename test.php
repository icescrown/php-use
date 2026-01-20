<?php 

use App\Models\{Post, PostTag, User}; 
use Illuminate\Support\Facades\{Soo, Depart, DB, Route};

class TestClass 
{ 
    public function testMethod() 
    { 
        // 只使用了User和DB类 
        $user = new User(); 
        $data = DB::table('users')->get(); 
        return $user; 
    } 

    public function phpDocMethod()
    {
        /**
         * @return User|Post
         * @throws TestException
         * @param Comment $comment
         * @var User $user
         * @type Post $post
         */
        return 'test';
    }
}